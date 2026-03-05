import { Switch, Route, Redirect } from "wouter";
import Login from "./pages/login";
import Register from "./pages/register";

function Dashboard() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <h1 className="text-3xl font-bold text-gray-800 mb-2">¡Bienvenido a AvisaYa!</h1>
        <p className="text-gray-500">Dashboard en construcción 🚧</p>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <Switch>
      <Route path="/" component={() => <Redirect to="/login" />} />
      <Route path="/login" component={Login} />
      <Route path="/register" component={Register} />
      <Route path="/dashboard" component={Dashboard} />
      <Route component={() => <Redirect to="/login" />} />
    </Switch>
  );
}
