import { useEffect, useState } from 'react';

async function api(path, body) {
  const res = await fetch('/api' + path, {
    method: body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + (localStorage.token || '') },
    body: body && JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'request failed');
  return data;
}

function Form({ fields, label, onSubmit }) {
  const [values, setValues] = useState({});
  const [error, setError] = useState('');
  const submit = async (e) => {
    e.preventDefault();
    try {
      await onSubmit(values);
      setValues({});
      setError('');
    } catch (err) {
      setError(err.message);
    }
  };
  return (
    <form onSubmit={submit}>
      {fields.map((f) => (
        <input key={f} placeholder={f} type={f === 'password' ? 'password' : 'text'} value={values[f] || ''}
          onChange={(e) => setValues({ ...values, [f]: e.target.value })} />
      ))}
      <button>{label}</button>
      {error && <span className="err"> {error}</span>}
    </form>
  );
}

function Auth({ onLogin }) {
  const [mode, setMode] = useState('login');
  const submit = async (values) => {
    const { token, user } = await api('/auth/' + mode, values);
    localStorage.token = token;
    localStorage.user = JSON.stringify(user);
    onLogin(user);
  };
  return (
    <>
      <h2>{mode === 'login' ? 'Log in' : 'Register'}</h2>
      <Form key={mode} fields={mode === 'login' ? ['email', 'password'] : ['name', 'email', 'password']} label="Go" onSubmit={submit} />
      <button onClick={() => setMode(mode === 'login' ? 'register' : 'login')}>
        {mode === 'login' ? 'Need an account?' : 'Have an account?'}
      </button>
    </>
  );
}

function Group({ id, onBack }) {
  const [data, setData] = useState(null);
  const load = () => api('/groups/' + id).then(setData);
  useEffect(() => { load(); }, [id]);
  if (!data) return <p>Loading...</p>;

  return (
    <>
      <button onClick={onBack}>&larr; Groups</button>
      <h2>{data.group.name}</h2>

      <h3>Balances</h3>
      <ul>
        {data.members.map((m) => (
          <li key={m.id}>{m.name} <span className={m.balance >= 0 ? 'pos' : 'neg'}>{Number(m.balance).toFixed(2)}</span></li>
        ))}
      </ul>
      <Form fields={['email']} label="Add member" onSubmit={(v) => api(`/groups/${id}/members`, v).then(load)} />

      <h3>Settle up</h3>
      {data.settlements.length ? (
        <ul>{data.settlements.map((s, i) => <li key={i}>{s.from} pays {s.to} {s.amount.toFixed(2)}</li>)}</ul>
      ) : <p>All settled.</p>}

      <h3>Expenses</h3>
      <Form fields={['description', 'amount']} label="Add (split equally)" onSubmit={(v) => api(`/groups/${id}/expenses`, v).then(load)} />
      <ul>
        {data.expenses.map((e) => <li key={e.id}>{e.description}: {e.amount} paid by {e.paid_by}</li>)}
      </ul>
    </>
  );
}

export default function App() {
  const [user, setUser] = useState(() => JSON.parse(localStorage.user || 'null'));
  const [groups, setGroups] = useState([]);
  const [open, setOpen] = useState(null);
  const loadGroups = () => api('/groups').then(setGroups).catch(logout);

  function logout() {
    localStorage.clear();
    setUser(null);
  }

  useEffect(() => { if (user) loadGroups(); }, [user]);

  if (!user) return <Auth onLogin={setUser} />;
  return (
    <>
      <p>Hi {user.name} <button onClick={logout}>Log out</button></p>
      {open ? <Group id={open} onBack={() => { setOpen(null); loadGroups(); }} /> : (
        <>
          <h2>Your groups</h2>
          <ul>{groups.map((g) => <li key={g.id}><a href="#" onClick={() => setOpen(g.id)}>{g.name}</a></li>)}</ul>
          <Form fields={['name']} label="Create group" onSubmit={(v) => api('/groups', v).then(loadGroups)} />
        </>
      )}
    </>
  );
}
