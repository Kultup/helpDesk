import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import './i18n';
import App from './App';
import ErrorBoundary from './components/ErrorBoundary';

// Глобальна обробка необроблених помилок
window.addEventListener('error', (event) => {
  // Обробка "Script error" - зазвичай виникає через CORS або завантаження скриптів з іншого домену
  if (event.message === 'Script error.' || event.message === 'Script error') {
    // В production запобігаємо показу помилки користувачу
    if (process.env.NODE_ENV === 'production') {
      event.preventDefault();
      event.stopPropagation();
      return false;
    }
    return;
  }
  
  console.error('Global error:', event.error);
  
  // В production запобігаємо показу стандартного повідомлення про помилку
  if (process.env.NODE_ENV === 'production') {
    // Не запобігаємо подію для ErrorBoundary, але приховуємо стандартний overlay
  }
}, true); // Використовуємо capture phase

window.addEventListener('unhandledrejection', (event) => {
  // Ігноруємо CORS та мережеві помилки
  const reason = event.reason;
  if (reason && (
    reason.message?.includes('CORS') ||
    reason.message?.includes('Network Error') ||
    reason.code === 'ERR_NETWORK' ||
    reason.message === 'Failed to fetch' ||
    reason.message?.includes('Script error')
  )) {
    // В production запобігаємо показу помилки
    if (process.env.NODE_ENV === 'production') {
      event.preventDefault();
    }
    console.warn('Network/CORS error (ignored):', reason);
    return;
  }
  
  console.error('Unhandled promise rejection:', reason);
  
  // В production запобігаємо показу стандартного повідомлення
  if (process.env.NODE_ENV === 'production') {
    event.preventDefault();
  }
});

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement
);

root.render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);
