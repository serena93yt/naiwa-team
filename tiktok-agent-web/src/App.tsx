import { useState, useEffect, useReducer } from 'react'
import { Routes, Route, useLocation } from 'react-router-dom'
import Sidebar from './components/Sidebar'
import Footer from './components/Footer'
import { loadSettings, subscribe } from './settings'
import Dashboard from './pages/Dashboard'
import ProductSearch from './pages/ProductSearch'
import Generate from './pages/Generate'
import GenerateDetail from './pages/GenerateDetail'
import Compliance from './pages/Compliance'
import Knowledge from './pages/Knowledge'
import AISettings from './pages/AISettings'
import ProductSearchSettings from './pages/ProductSearchSettings'

export default function App() {
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const location = useLocation()
  const settings = loadSettings()
  // 服务端 AI 配置同步完成后，强制刷新以应用最新的「运行模式」等设置
  const [, force] = useReducer((x: number) => x + 1, 0)
  useEffect(() => subscribe(() => force()), [])

  // 路由变化时关闭移动端抽屉
  useEffect(() => {
    setMobileOpen(false)
  }, [location.pathname])

  return (
    <div className="layout">
      <Sidebar
        collapsed={collapsed}
        mobileOpen={mobileOpen}
        onToggle={() => setCollapsed((c) => !c)}
        onCloseMobile={() => setMobileOpen(false)}
      />
      {mobileOpen && <div className="scrim" onClick={() => setMobileOpen(false)} />}

      <div className="content">
        <div className="topbar">
          <button className="icon-btn menu-btn" onClick={() => setMobileOpen(true)} aria-label="菜单">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 6h16M4 12h16M4 18h16" /></svg>
          </button>
          <span className={`badge ${settings.mode === 'real' ? 'badge-blue' : 'badge-gray'}`}>
            {settings.mode === 'real' ? '真实 LLM' : '模拟数据'}
          </span>
          <span className="spacer" />
        </div>

        <div className="page">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/products/search" element={<ProductSearch />} />
            <Route path="/products/generate" element={<Generate />} />
            <Route path="/products/generate/:country" element={<GenerateDetail />} />
            <Route path="/products/compliance" element={<Compliance />} />
            <Route path="/settings/knowledge" element={<Knowledge />} />
            <Route path="/settings/ai" element={<AISettings />} />
            <Route path="/settings/product-search" element={<ProductSearchSettings />} />
          </Routes>
        </div>
        <Footer />
      </div>
    </div>
  )
}
