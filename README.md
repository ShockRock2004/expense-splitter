# expense-splitter

A group expense tracker built on the PERN stack (PostgreSQL, Express, React, Node) that works out
who owes whom.

- Relational schema (users, groups, members, expenses, per-user splits) with foreign keys and check constraints
- JWT authentication with bcrypt password hashing
- Expenses are split equally and written inside a transaction
- A greedy debt-simplification step settles each group in the fewest payments

## Setup

```sh
createdb expense_splitter
psql expense_splitter -f server/schema.sql

cd server && npm install && npm start      # API on :4000
cd client && npm install && npm run dev    # UI on :5173
```

Environment (optional): `DATABASE_URL`, `JWT_SECRET`, `PORT`.
