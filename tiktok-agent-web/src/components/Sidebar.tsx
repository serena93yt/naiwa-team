import { NavLink, useNavigate } from 'react-router-dom'

function Icon({ name }: { name: string }) {
  const common = {
    width: 18,
    height: 18,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  }
  if (name === 'home') {
    return (
      <svg {...common}><path d="M3 11l9-8 9 8" /><path d="M5 10v10h14V10" /></svg>
    )
  }
  if (name === 'spark') {
    return (
      <svg {...common}><path d="M12 3l2.2 5.8L20 11l-5.8 2.2L12 19l-2.2-5.8L4 11l5.8-2.2z" /></svg>
    )
  }
  // gear
  return (
    <svg {...common}><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2" /></svg>
  )
}

type Child = { label: string; to: string }
type Node =
  | { type: 'link'; label: string; to: string; end?: boolean; icon: string }
  | { type: 'group'; label: string; icon: string; children: Child[] }

const NAV: Node[] = [
  { type: 'link', label: '首页', to: '/', end: true, icon: 'home' },
  {
    type: 'group',
    label: '爆品种草',
    icon: 'spark',
    children: [
      { label: '爆品搜索', to: '/products/search' },
      { label: '种草内容生成', to: '/products/generate' },
      { label: '合规预检', to: '/products/compliance' },
    ],
  },
  {
    type: 'group',
    label: '智能体设置',
    icon: 'gear',
    children: [
      { label: '知识库', to: '/settings/knowledge' },
      { label: 'AI设置', to: '/settings/ai' },
      { label: '搜索配置', to: '/settings/product-search' },
    ],
  },
]

interface Props {
  collapsed: boolean
  mobileOpen: boolean
  onToggle: () => void
  onCloseMobile: () => void
}

export default function Sidebar({ collapsed, mobileOpen, onToggle, onCloseMobile }: Props) {
  const navigate = useNavigate()

  function handleParent(node: Node) {
    if (collapsed) {
      onToggle() // 展开侧栏
      if (node.type === 'group') navigate(node.children[0].to)
      else navigate(node.to)
      return
    }
    if (node.type === 'group') navigate(node.children[0].to)
    else navigate(node.to)
  }

  return (
    <aside className={`sidebar${collapsed ? ' collapsed' : ''}${mobileOpen ? ' open' : ''}`}>
      <div className="brand">
        <span className="dot" />
        <span className="brand-text">TikBoost AI</span>
      </div>

      <nav className="side-nav">
        {NAV.map((node) => (
          <div className="nav-group" key={node.label}>
            <button className="nav-parent" onClick={() => handleParent(node)} title={node.label}>
              <Icon name={node.icon} />
              <span className="label">{node.label}</span>
            </button>
            {node.type === 'group' && (
              <div className="children">
                {node.children.map((c) => (
                  <NavLink
                    key={c.to}
                    to={c.to}
                    className={({ isActive }) => `nav-child${isActive ? ' active' : ''}`}
                    onClick={onCloseMobile}
                  >
                    {c.label}
                  </NavLink>
                ))}
              </div>
            )}
          </div>
        ))}
      </nav>

      <button className="collapse-btn" onClick={onToggle}>
        {collapsed ? '›' : '‹ 收起'}
      </button>
    </aside>
  )
}
