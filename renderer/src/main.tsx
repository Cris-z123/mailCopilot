/**
 * Renderer Process Entry Point
 */

import React from 'react';
import ReactDOM from 'react-dom/client';
import ReportView from '@renderer/components/ReportView';

const reportDate = new Date().toISOString().split('T')[0];

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ReportView reportDate={reportDate} />
  </React.StrictMode>
);
