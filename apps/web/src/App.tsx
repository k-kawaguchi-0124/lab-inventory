import { BrowserRouter, Link, Route, Routes } from "react-router-dom";
import { HomePage } from "./pages/HomePage";
import { StalePage } from "./pages/StalePage";

export default function App() {
  return (
    <BrowserRouter>
      <div style={{ padding: 12, borderBottom: "1px solid #ddd" }}>
        <Link to="/" style={{ marginRight: 12 }}>Home</Link>
        <Link to="/stale">Stale</Link>
      </div>

      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/stale" element={<StalePage />} />
      </Routes>
    </BrowserRouter>
  );
}
