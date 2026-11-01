import React from 'react';
import {
  Briefcase,
  Laptop,
  TrendingUp,
  DollarSign,
  Utensils,
  Flame,
  Car,
  Sparkles,
  PiggyBank,
  HeartPulse,
  CreditCard,
  ShoppingBag,
  Home,
  Gift,
  Smartphone,
  BookOpen,
  User,
  TrendingDown,
  HelpCircle,
} from 'lucide-react';

/**
 * Icon names the user can pick when creating or editing a topic.
 * This list is the single source of truth for the topic icon picker.
 */
export const AVAILABLE_ICONS = [
  'Briefcase',
  'Laptop',
  'TrendingUp',
  'DollarSign',
  'Utensils',
  'Flame',
  'Car',
  'Sparkles',
  'PiggyBank',
  'HeartPulse',
  'CreditCard',
  'ShoppingBag',
  'Home',
  'Gift',
  'Smartphone',
  'BookOpen',
];

/**
 * Bounded registry of icons that can be resolved dynamically by name.
 * Includes every AVAILABLE_ICONS entry plus icons referenced by seeded
 * topics in initialData (User, TrendingDown) and the fallback (HelpCircle).
 * Keeping this map explicit lets the bundler tree-shake lucide-react down
 * to only the icons actually used.
 */
export const ICON_REGISTRY: Record<string, React.ElementType> = {
  Briefcase,
  Laptop,
  TrendingUp,
  DollarSign,
  Utensils,
  Flame,
  Car,
  Sparkles,
  PiggyBank,
  HeartPulse,
  CreditCard,
  ShoppingBag,
  Home,
  Gift,
  Smartphone,
  BookOpen,
  User,
  TrendingDown,
  HelpCircle,
};

export const FALLBACK_ICON = HelpCircle;
