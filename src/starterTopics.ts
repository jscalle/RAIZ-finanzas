import type { Topic } from './types';

// Categories every new space starts with. They are plain and editable: the user can rename,
// change or delete any of them in Categorías, and none has a spending limit.
// Two ids are special on purpose because the app logic depends on them:
//  - topic_1787580821277: credit card payments (settles earlier card purchases)
//  - topic_ahorros: savings transfers (kept out of the monthly spending)
export const starterTopics: Topic[] = [
  {
    id: 'topic_salario',
    name: 'Salario',
    type: 'INCOME',
    icon: 'Briefcase',
    color: 'emerald',
  },
  {
    id: 'topic_freelance',
    name: 'Extras / Freelance',
    type: 'INCOME',
    icon: 'Laptop',
    color: 'cyan',
  },
  {
    id: 'topic_otros_ingresos',
    name: 'Otros ingresos',
    type: 'INCOME',
    icon: 'DollarSign',
    color: 'blue',
  },
  {
    id: 'topic_comida',
    name: 'Alimentación',
    type: 'EXPENSE',
    icon: 'ShoppingBag',
    color: 'amber',
  },
  {
    id: 'topic_restaurantes',
    name: 'Restaurantes',
    type: 'EXPENSE',
    icon: 'Utensils',
    color: 'orange',
  },
  {
    id: 'topic_transporte',
    name: 'Transporte',
    type: 'EXPENSE',
    icon: 'Car',
    color: 'blue',
  },
  {
    id: 'topic_hogar',
    name: 'Hogar',
    type: 'EXPENSE',
    icon: 'Home',
    color: 'indigo',
  },
  {
    id: 'topic_servicios',
    name: 'Servicios Públicos',
    type: 'EXPENSE',
    icon: 'Flame',
    color: 'rose',
  },
  {
    id: 'topic_salud',
    name: 'Salud',
    type: 'EXPENSE',
    icon: 'HeartPulse',
    color: 'pink',
  },
  {
    id: 'topic_ocio',
    name: 'Ocio y Entretenimiento',
    type: 'EXPENSE',
    icon: 'Sparkles',
    color: 'purple',
  },
  {
    id: 'topic_suscripciones',
    name: 'Suscripciones',
    type: 'EXPENSE',
    icon: 'Smartphone',
    color: 'cyan',
  },
  {
    id: 'topic_educacion',
    name: 'Educación',
    type: 'EXPENSE',
    icon: 'BookOpen',
    color: 'indigo',
  },
  {
    id: 'topic_otros_gastos',
    name: 'Otros gastos',
    type: 'EXPENSE',
    icon: 'Gift',
    color: 'amber',
  },
  {
    id: 'topic_1787580821277',
    name: 'Tarjetas / Créditos',
    type: 'EXPENSE',
    icon: 'CreditCard',
    color: 'cyan',
  },
  {
    id: 'topic_ahorros',
    name: 'Ahorro General',
    type: 'SAVINGS',
    icon: 'PiggyBank',
    color: 'pink',
  },
];
