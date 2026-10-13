import React from 'react';
import {
  AdminAnalyticsRole,
  ROLE_COLORS,
  resolveAdminAnalyticsRole,
} from '../../../utils/adminAnalytics';
import { UserProfile } from '../../../types';

interface RoleBadgeProps {
  role?: AdminAnalyticsRole;
  user?: UserProfile;
  className?: string;
}

export const RoleBadge: React.FC<RoleBadgeProps> = ({ role, user, className = '' }) => {
  const resolved = role || (user ? resolveAdminAnalyticsRole(user) : 'other');
  const meta = ROLE_COLORS[resolved];
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase tracking-wider border ${meta.bg} ${meta.text} ${meta.border} ${className}`}
    >
      {meta.label}
    </span>
  );
};
