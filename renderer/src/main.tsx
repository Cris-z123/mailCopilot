/**
 * Renderer Process Entry Point
 */

import React from 'react';
import ReactDOM from 'react-dom/client';
import { ReportView } from './components/ReportView';
import './components/ReportView/ReportView.css';

// Mock data for demonstration
const mockReportDate = new Date().toISOString().split('T')[0];

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <div style={{ padding: '20px', fontFamily: 'Arial, sans-serif' }}>
      <header style={{ marginBottom: '30px', borderBottom: '2px solid #1976d2', paddingBottom: '20px' }}>
        <h1 style={{ color: '#1976d2', margin: 0 }}>MailCopilot</h1>
        <p style={{ margin: '5px 0', color: '#666' }}>Email Item Traceability & Verification System</p>
        <p style={{ margin: '5px 0', fontSize: '14px', color: '#888' }}>
          ✅ Tasks T045-T048 Complete: ReportView, TraceabilityInfo, IPC Service, Zustand Store
        </p>
      </header>

      <div style={{ backgroundColor: '#e3f2fd', padding: '15px', borderRadius: '8px', marginBottom: '20px' }}>
        <h2 style={{ margin: '0 0 10px 0', color: '#1565c0' }}>🎉 UI Components Successfully Implemented!</h2>
        <ul style={{ margin: 0, paddingLeft: '20px' }}>
          <li><strong>ReportView</strong> - Main report display with confidence-based styling</li>
          <li><strong>TraceabilityInfo</strong> - Source information with copy-to-clipboard</li>
          <li><strong>IPC Client Service</strong> - Type-safe IPC communication</li>
          <li><strong>Zustand Store</strong> - Report state management</li>
        </ul>
        <p style={{ margin: '10px 0 0 0', fontSize: '14px', color: '#666' }}>
          📝 Note: This is a demonstration view. The ReportView below shows the empty state component.
        </p>
      </div>

      <ReportView reportDate={mockReportDate} />
    </div>
  </React.StrictMode>
);
