import { Switch, Route, Redirect } from "wouter";
import Login from "./pages/login";
import Register from "./pages/register";
import Dashboard from "./pages/dashboard";
import OrderStatus from "./pages/order-status";
import LandingPage from "./pages/landing";

export default function App() {
  return (
    <Switch>
      <Route path="/" component={LandingPage} />
      <Route path="/login" component={Login} />
      <Route path="/register" component={Register} />
      <Route path="/dashboard" component={Dashboard} />
      <Route path="/order/:token" component={OrderStatus} />
      <Route component={() => <Redirect to="/" />} />
    </Switch>
  );
}
