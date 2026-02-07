/**
 * FeedbackButtons Component (T060)
 *
 * User Story 3: Local Privacy-Preserving Feedback System
 *
 * Displays ✓ and ✗ buttons for marking action items as correct or incorrect.
 * Each button has a tooltip: "✓ 标记准确" and "✗ 标记错误".
 *
 * Features:
 * - TailwindCSS v3.4 styling
 * - shadcn/ui Button component
 * - Tooltip on hover
 * - Icons from Lucide React
 * - onClick callbacks for parent component handling
 *
 * Per plan.md:
 * - FR-021: Feedback button visibility (hover tooltips)
 * - FR-022: 4 error categories when marking incorrect
 * - Local-only feedback (no network transmission)
 */

import { Check, X } from 'lucide-react';
import { Button } from '@renderer/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@renderer/components/ui/tooltip';

/**
 * Feedback button props
 */
export interface FeedbackButtonsProps {
  /**
   * Callback when user marks item as correct (✓)
   */
  onMarkCorrect: () => void;

  /**
   * Callback when user marks item as incorrect (✗)
   */
  onMarkIncorrect: () => void;

  /**
   * Disable buttons (e.g., during submission)
   */
  disabled?: boolean;

  /**
   * Additional CSS class name
   */
  className?: string;

  /**
   * Button size variant
   */
  size?: 'default' | 'sm' | 'lg' | 'icon';
}

/**
 * FeedbackButtons component
 *
 * Renders two buttons side-by-side:
 * - ✓ button with green tint for "Mark as Correct"
 * - ✗ button with red tint for "Mark as Incorrect"
 *
 * Each button displays a tooltip on hover with Chinese text.
 */
export const FeedbackButtons = ({
  onMarkCorrect,
  onMarkIncorrect,
  disabled = false,
  className = '',
  size = 'sm',
}: FeedbackButtonsProps) => {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {/* Mark Correct Button (✓) */}
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size={size}
              onClick={onMarkCorrect}
              disabled={disabled}
              className="text-green-600 hover:text-green-700 hover:bg-green-50 border-green-200"
              aria-label="标记准确"
            >
              <Check className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>✓ 标记准确</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      {/* Mark Incorrect Button (✗) */}
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size={size}
              onClick={onMarkIncorrect}
              disabled={disabled}
              className="text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200"
              aria-label="标记错误"
            >
              <X className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>✗ 标记错误</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  );
};

/**
 * Compact version of FeedbackButtons for inline display
 *
 * Smaller buttons with minimal spacing for tight UI layouts.
 */
export const FeedbackButtonsCompact = (props: FeedbackButtonsProps) => {
  return (
    <FeedbackButtons
      {...props}
      size="icon"
      className="gap-1"
    />
  );
};

export default FeedbackButtons;
