import React from 'react'
import ReactDOM from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import App from './App'
import { syncAiStoreFromServer } from './settings'
import { syncKbFromServer } from './store/kbStore'
import './theme.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </React.StrictMode>,
)

// 启动后从服务端拉取 AI 配置（运行模式 + Agent 列表）与知识库（四库），
// 运营在服务器上的设置对所有访客即时生效
syncAiStoreFromServer()
syncKbFromServer()
