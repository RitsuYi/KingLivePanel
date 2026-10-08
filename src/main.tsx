import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { PanelAPI, Snapshot } from '../shared/model';
import { Control } from './Control';
import { Strip } from './Strip';
import { Guide } from './Guide';
import { TitleBar } from './TitleBar';
import './styles.css';

declare global { interface Window { panel: PanelAPI } }
const page = location.hash.slice(1);
document.body.dataset.page = page;
if (page === 'overlay') document.title = '王者直播信息屏 · 直播展示';
else if (page === 'guide') document.title = '使用说明 · 王者直播信息屏';
else document.title = '王者直播信息屏 · 控制台';

function App() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    if (page === 'guide') return;
    if (!window.panel) { setError('请通过桌面程序启动控制台。'); return; }
    let updated = false;
    const unsub = window.panel.subscribe(value => { updated = true; setSnapshot(value); });
    void window.panel.snapshot().then(value => { if (!updated) setSnapshot(value); }).catch(() => setError('程序连接失败，请重新启动。'));
    return unsub;
  }, []);
  if (page === 'guide') return <Guide/>;
  if (error) return <p role="alert">{error}</p>;
  if (!snapshot) return null;
  return page === 'overlay' ? <Strip state={snapshot.state} status={snapshot.runtime.heartStatus} heartRate={snapshot.runtime.heartRate}/> : <Control snapshot={snapshot}/>;
}
createRoot(document.getElementById('root')!).render(<React.StrictMode>
  {page === 'overlay' ? <App/> : <div className="desktop-shell">
    <TitleBar guide={page === 'guide'}/>
    <div className="desktop-content"><App/></div>
  </div>}
</React.StrictMode>);
