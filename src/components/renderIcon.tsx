import React from 'react';
import { ICON_REGISTRY, FALLBACK_ICON } from './iconRegistry';

export const renderIcon = (iconName: string, className = 'h-5 w-5') => {
  const IconComponent = ICON_REGISTRY[iconName] ?? FALLBACK_ICON;
  return <IconComponent className={className} />;
};
