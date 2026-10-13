import React from 'react';
import { AnalyticsDashboardHub } from './AnalyticsDashboardHub';

interface FemaleEarningsDashboardProps {
  onOpenStore?: () => void;
  onStartCall?: (creatorId: string) => void;
  onOpenChat?: (creatorId: string) => void;
  onOpenCallLogs?: () => void;
}

export const FemaleEarningsDashboard: React.FC<FemaleEarningsDashboardProps> = (props) => {
  return <AnalyticsDashboardHub {...props} />;
};
