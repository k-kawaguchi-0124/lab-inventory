import { BrowserRouter, NavLink, Route, Routes } from "react-router-dom";
import { HomePage } from "./pages/HomePage";
import { StalePage } from "./pages/StalePage";
import { AssetCreatePage } from "./pages/AssetCreatePage";
import { AssetCheckoutPage } from "./pages/AssetCheckoutPage";
import { AssetCheckinPage } from "./pages/AssetCheckinPage";
import { AssetMovePage } from "./pages/AssetMovePage";
import { AssetListPage } from "./pages/AssetListPage";
import { AssetEditPage } from "./pages/AssetEditPage";
import { UsersPage } from "./pages/UsersPage";
import { AssetSearchPage } from "./pages/AssetSearchPage";

export default function App() {
  return (
    <BrowserRouter>
      <div className="app-shell">
        <header className="topbar">
          <div className="topbar-inner">
            <NavLink to="/" className="brand">
              Lab Inventory
            </NavLink>
            <nav className="topnav">
              <NavLink to="/stale" className="topnav-link">
                長期未更新
              </NavLink>
              <NavLink to="/assets" end className="topnav-link">
                物品一覧
              </NavLink>
              <NavLink to="/assets/new" className="topnav-link">
                新規登録
              </NavLink>
              <NavLink to="/users" className="topnav-link">
                ユーザ
              </NavLink>
            </nav>
          </div>
        </header>
        <main className="page-container">
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/stale" element={<StalePage />} />
            <Route path="/assets" element={<AssetListPage />} />
            <Route path="/assets/search" element={<AssetSearchPage />} />
            <Route path="/assets/:id/edit" element={<AssetEditPage />} />
            <Route path="/assets/new" element={<AssetCreatePage />} />
            <Route path="/assets/checkout" element={<AssetCheckoutPage />} />
            <Route path="/assets/checkin" element={<AssetCheckinPage />} />
            <Route path="/assets/move" element={<AssetMovePage />} />
            <Route path="/users" element={<UsersPage />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}
