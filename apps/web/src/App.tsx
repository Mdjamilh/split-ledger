import { Link, Route, Routes } from "react-router";

import { Layout, RequireAuth } from "./components/Layout";
import ui from "./components/ui.module.css";
import { LoginPage, RegisterPage } from "./pages/Auth";
import { ExpenseFormPage } from "./pages/ExpenseForm";
import { GroupPage } from "./pages/Group";
import { GroupsPage } from "./pages/Groups";
import { InvitePage } from "./pages/Invite";

function NotFound() {
  return (
    <div className={ui.card} style={{ padding: "2rem", display: "grid", gap: "0.6rem", justifyItems: "start" }}>
      <h1>Page not found</h1>
      <p className={ui.muted}>That address doesn't match anything here.</p>
      <Link to="/" className={ui.button}>
        Back to your groups
      </Link>
    </div>
  );
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route element={<Layout />}>
        <Route element={<RequireAuth />}>
          <Route index element={<GroupsPage />} />
          <Route path="groups/:groupId" element={<GroupPage />} />
          <Route path="groups/:groupId/expenses/new" element={<ExpenseFormPage />} />
          <Route path="groups/:groupId/expenses/:expenseId/edit" element={<ExpenseFormPage />} />
          <Route path="invite/:token" element={<InvitePage />} />
        </Route>
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
