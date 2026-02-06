/**
 * FirstRunDisclosure Component
 *
 * Displays explicit disclosure of data transmission scope per Constitution Principle I.
 * Only shows on first launch before user can use the application.
 *
 * References:
 * - Spec FR-031: System MUST default to remote mode on first launch
 * - Constitution Principle I: Privacy-First Architecture
 * - Task T018a: Create first-run disclosure screen
 */

import { useEffect, useState } from 'react';
import { Shield, AlertCircle, CheckCircle2 } from 'lucide-react';

interface OnboardingStatus {
  hasAcknowledgedDisclosure: boolean;
  disclosureVersion: string;
  acknowledgedAt?: number;
}

interface FirstRunDisclosureProps {
  onAcknowledged: () => void;
}

function FirstRunDisclosure({ onAcknowledged }: FirstRunDisclosureProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [acknowledging, setAcknowledging] = useState(false);

  useEffect(() => {
    checkStatus();
  }, []);

  /**
   * Check if user has already acknowledged the disclosure
   */
  async function checkStatus() {
    try {
      setLoading(true);
      const status = await window.ipc.invoke<OnboardingStatus>(
        'onboarding:get-status'
      );

      if (status.hasAcknowledgedDisclosure) {
        // User already acknowledged, proceed to app
        onAcknowledged();
      }
    } catch (err) {
      console.error('Failed to check onboarding status:', err);
      setError('Failed to load onboarding status');
    } finally {
      setLoading(false);
    }
  }

  /**
   * Handle user acknowledgment of the disclosure
   */
  async function handleAcknowledge() {
    try {
      setAcknowledging(true);
      await window.ipc.invoke('onboarding:acknowledge');
      onAcknowledged();
    } catch (err) {
      console.error('Failed to acknowledge disclosure:', err);
      setError('Failed to save acknowledgment. Please try again.');
    } finally {
      setAcknowledging(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4" />
          <p className="text-slate-600">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center p-6">
      <div className="max-w-2xl w-full">
        <div className="bg-white rounded-2xl shadow-2xl p-8 md:p-12">
          {/* Header */}
          <div className="flex items-center gap-3 mb-6">
            <Shield className="h-8 w-8 text-blue-600" />
            <h1 className="text-2xl md:text-3xl font-bold text-slate-900">
              Welcome to mailCopilot
            </h1>
          </div>

          {/* Disclosure Title */}
          <div className="mb-6">
            <h2 className="text-xl font-semibold text-slate-800 mb-2">
              Data Transmission Notice
            </h2>
            <p className="text-slate-600">
              Before you begin, please review how your data is processed.
            </p>
          </div>

          {/* Remote Mode Disclosure */}
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-6 mb-6">
            <div className="flex items-start gap-3 mb-4">
              <AlertCircle className="h-6 w-6 text-blue-600 flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="font-semibold text-blue-900 mb-1">
                  Remote Mode (Default)
                </h3>
                <p className="text-sm text-blue-700">
                  You are about to use remote mode for email processing.
                </p>
              </div>
            </div>

            <ul className="space-y-2 text-sm text-blue-800 ml-9">
              <li className="flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 text-blue-600 flex-shrink-0 mt-0.5" />
                <span>
                  Email content will be sent to a third-party LLM service via{' '}
                  <strong>TLS 1.3 encryption</strong>
                </span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 text-blue-600 flex-shrink-0 mt-0.5" />
                <span>All processing occurs remotely on secure servers</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 text-blue-600 flex-shrink-0 mt-0.5" />
                <span>
                  <strong>No data is stored</strong> on external servers after
                  processing
                </span>
              </li>
            </ul>
          </div>

          {/* Local Mode Option */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-6 mb-6">
            <div className="flex items-start gap-3 mb-4">
              <Shield className="h-6 w-6 text-slate-600 flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="font-semibold text-slate-900 mb-1">
                  Privacy Option: Local Mode
                </h3>
                <p className="text-sm text-slate-700">
                  For complete privacy, you can switch to local mode in Settings.
                </p>
              </div>
            </div>

            <ul className="space-y-2 text-sm text-slate-700 ml-9">
              <li className="flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 text-slate-600 flex-shrink-0 mt-0.5" />
                <span>
                  Local mode processes all data <strong>on your device</strong>{' '}
                  using Ollama
                </span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 text-slate-600 flex-shrink-0 mt-0.5" />
                <span>
                  <strong>No data is transmitted</strong> to external services
                </span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 text-slate-600 flex-shrink-0 mt-0.5" />
                <span>Requires Ollama installation (see documentation)</span>
              </li>
            </ul>
          </div>

          {/* Settings Link */}
          <div className="text-sm text-slate-600 mb-8 p-4 bg-slate-50 rounded-lg">
            <p>
              <span className="font-medium">Settings → Mode Selection:</span> You
              can change between remote and local mode at any time.
            </p>
          </div>

          {/* Error Message */}
          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}

          {/* Acknowledge Button */}
          <div className="flex flex-col sm:flex-row gap-3">
            <button
              onClick={handleAcknowledge}
              disabled={acknowledging}
              className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-semibold py-3 px-6 rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              {acknowledging ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                  <span>Saving...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-5 w-5" />
                  <span>I Understand, Continue</span>
                </>
              )}
            </button>
          </div>

          {/* Additional Info */}
          <p className="text-xs text-slate-500 text-center mt-6">
            Your acknowledgment is stored locally. This disclosure is shown once
            per installation.
          </p>
        </div>

        {/* Footer */}
        <div className="text-center mt-6 text-sm text-slate-600">
          <p>
            Read our{' '}
            <a href="#" className="text-blue-600 hover:underline">
              Privacy Policy
            </a>{' '}
            and{' '}
            <a href="#" className="text-blue-600 hover:underline">
              Constitution
            </a>{' '}
            for more details.
          </p>
        </div>
      </div>
    </div>
  );
}

export default FirstRunDisclosure;
