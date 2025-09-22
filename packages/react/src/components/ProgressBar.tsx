import React from 'react';
import type { ProgressBarProps } from '../types';

export function ProgressBar({
  progress,
  className = '',
  showPercentage = true,
}: ProgressBarProps) {
  const normalizedProgress = Math.min(Math.max(progress, 0), 100);

  return (
    <div className={`tigris-progress-bar ${className}`}>
      <div className="tigris-progress-container">
        <div
          className="tigris-progress-fill"
          style={{
            width: `${normalizedProgress}%`,
            backgroundColor: '#4CAF50',
            height: '100%',
            transition: 'width 0.3s ease',
          }}
        />
      </div>
      {showPercentage && (
        <span className="tigris-progress-text">
          {Math.round(normalizedProgress)}%
        </span>
      )}
    </div>
  );
}
