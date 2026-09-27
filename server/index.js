import express from 'express';
import pg from 'pg';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { settle } from './settle.js';

const db = new pg.Pool({ connectionString: process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost/expense_splitter' });
const SECRET = process.env.JWT_SECRET || 'dev-secret';
const app = express();
app.use(express.json());

const q = (text, params) => db.query(text, params).then((r) => r.rows);
const wrap = (fn) => (req, res, next) => fn(req, res).catch(next);
const sign = (u) => jwt.sign({ id: u.id, name: u.name }, SECRET, { expiresIn: '7d' });

app.post('/api/auth/register', wrap(async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) return res.status(400).json({ error: 'name, email and password are required' });
  const [user] = await q(
    'INSERT INTO users (name, email, password_hash) VALUES ($1, $2, $3) RETURNING id, name',
    [name, email.toLowerCase(), await bcrypt.hash(password, 10)]
  );
  res.json({ token: sign(user), user });
}));

app.post('/api/auth/login', wrap(async (req, res) => {
  const { email = '', password = '' } = req.body;
  const [user] = await q('SELECT * FROM users WHERE email = $1', [email.toLowerCase()]);
  if (!user || !(await bcrypt.compare(password, user.password_hash))) return res.status(401).json({ error: 'invalid credentials' });
  res.json({ token: sign(user), user: { id: user.id, name: user.name } });
}));

app.use('/api/groups', (req, res, next) => {
  try {
    req.user = jwt.verify((req.headers.authorization || '').replace('Bearer ', ''), SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'unauthorized' });
  }
});

const memberOnly = (req, res, next) =>
  q('SELECT 1 FROM group_members WHERE group_id = $1 AND user_id = $2', [req.params.id, req.user.id])
    .then((rows) => (rows.length ? next() : res.status(403).json({ error: 'not a member of this group' })))
    .catch(next);

app.get('/api/groups', wrap(async (req, res) => {
  res.json(await q(
    'SELECT g.id, g.name FROM groups g JOIN group_members m ON m.group_id = g.id WHERE m.user_id = $1 ORDER BY g.id',
    [req.user.id]
  ));
}));

app.post('/api/groups', wrap(async (req, res) => {
  if (!req.body.name) return res.status(400).json({ error: 'name is required' });
  const [group] = await q(
    `WITH g AS (INSERT INTO groups (name, created_by) VALUES ($1, $2) RETURNING id, name),
          m AS (INSERT INTO group_members SELECT id, $2 FROM g)
     SELECT * FROM g`,
    [req.body.name, req.user.id]
  );
  res.json(group);
}));

app.get('/api/groups/:id', memberOnly, wrap(async (req, res) => {
  const gid = req.params.id;
  const [group] = await q('SELECT id, name FROM groups WHERE id = $1', [gid]);
  const members = await q(
    `SELECT u.id, u.name, u.email,
       COALESCE((SELECT SUM(amount) FROM expenses WHERE group_id = $1 AND paid_by = u.id), 0)
     - COALESCE((SELECT SUM(s.share) FROM expense_splits s JOIN expenses e ON e.id = s.expense_id
                 WHERE e.group_id = $1 AND s.user_id = u.id), 0) AS balance
     FROM users u JOIN group_members m ON m.user_id = u.id WHERE m.group_id = $1 ORDER BY u.name`,
    [gid]
  );
  const expenses = await q(
    `SELECT e.id, e.description, e.amount, u.name AS paid_by, e.created_at
     FROM expenses e JOIN users u ON u.id = e.paid_by WHERE e.group_id = $1 ORDER BY e.id DESC`,
    [gid]
  );
  const settlements = settle(members.map((m) => ({ name: m.name, cents: Math.round(Number(m.balance) * 100) })));
  res.json({ group, members, expenses, settlements });
}));

app.post('/api/groups/:id/members', memberOnly, wrap(async (req, res) => {
  const [user] = await q('SELECT id FROM users WHERE email = $1', [(req.body.email || '').toLowerCase()]);
  if (!user) return res.status(404).json({ error: 'no user with that email' });
  await q('INSERT INTO group_members VALUES ($1, $2) ON CONFLICT DO NOTHING', [req.params.id, user.id]);
  res.json({ ok: true });
}));

app.post('/api/groups/:id/expenses', memberOnly, wrap(async (req, res) => {
  const cents = Math.round(Number(req.body.amount) * 100);
  if (!req.body.description || !(cents > 0)) return res.status(400).json({ error: 'description and positive amount required' });

  const ids = (await q('SELECT user_id FROM group_members WHERE group_id = $1 ORDER BY user_id', [req.params.id])).map((r) => r.user_id);
  const base = Math.floor(cents / ids.length), extra = cents % ids.length;

  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const { rows: [exp] } = await client.query(
      'INSERT INTO expenses (group_id, paid_by, description, amount) VALUES ($1, $2, $3, $4) RETURNING id',
      [req.params.id, req.user.id, req.body.description, cents / 100]
    );
    for (let i = 0; i < ids.length; i++)
      await client.query('INSERT INTO expense_splits VALUES ($1, $2, $3)', [exp.id, ids[i], (base + (i < extra ? 1 : 0)) / 100]);
    await client.query('COMMIT');
    res.json({ id: exp.id });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}));

app.use((err, req, res, next) => {
  if (err.code === '23505') return res.status(409).json({ error: 'already exists' });
  console.error(err);
  res.status(500).json({ error: 'server error' });
});

app.listen(process.env.PORT || 4000, () => console.log('API on :' + (process.env.PORT || 4000)));
