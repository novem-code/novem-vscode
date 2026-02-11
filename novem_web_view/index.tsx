import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles.css';
import { writeCSP } from './utils';

document.addEventListener('DOMContentLoaded', writeCSP);

const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);

root.render(<App />);
