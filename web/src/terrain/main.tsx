import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../atlas/study.css';
import './terrain.css';
import { TerrainStudy } from './TerrainStudy';

createRoot(document.getElementById('root')!).render(<StrictMode><TerrainStudy /></StrictMode>);
