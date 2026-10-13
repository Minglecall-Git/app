import React from 'react';
import { UserProfile } from '../../types';
import { AdminUserAnalyticsDrawer } from './analytics/AdminUserAnalyticsDrawer';
import { buildDateRange } from '../../utils/adminAnalytics';

interface UserAnalyticsModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: UserProfile | null;
  onOverrideEarning?: (user: UserProfile) => void;
}

/**
 * Admin inspect entry — admin-native drawer is primary (consumer hub is a sub-tab).
 * Named export preserved for existing AdminDashboard call sites.
 */
export const UserAnalyticsModal: React.FC<UserAnalyticsModalProps> = ({
  isOpen,
  onClose,
  user,
  onOverrideEarning,
}) => {
  return (
    <AdminUserAnalyticsDrawer
      isOpen={isOpen}
      onClose={onClose}
      user={user}
      range={buildDateRange('30d')}
      onOverrideEarning={onOverrideEarning}
    />
  );
};
