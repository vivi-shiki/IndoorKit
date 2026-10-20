import './engine/maplibre';
import './style.css';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { stats } from './testing/hooks';

// 跨页面的统计从第一次加载开始计数
stats();
createRoot(document.querySelector<HTMLDivElement>('#app')!).render(<App />);
