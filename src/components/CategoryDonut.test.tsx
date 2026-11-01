import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import CategoryDonut from './CategoryDonut';
import { CategorySlice } from '../types';

const fmt = (amount: number) => `$${amount}`;

const slices: CategorySlice[] = [
  { topicId: 'food', name: 'Comida', color: 'amber', total: 400, percent: 40 },
  {
    topicId: 'transport',
    name: 'Transporte',
    color: 'cyan',
    total: 350,
    percent: 35,
  },
  {
    topicId: 'health',
    name: 'Salud',
    color: 'emerald',
    total: 250,
    percent: 25,
  },
];

describe('CategoryDonut', () => {
  it('renders the empty state when there are no slices', () => {
    render(<CategoryDonut slices={[]} total={0} formatCurrency={fmt} />);
    expect(screen.getByText(/Sin gastos para mostrar/i)).toBeInTheDocument();
  });

  it('renders a legend row per category with name, percent and amount', () => {
    render(<CategoryDonut slices={slices} total={1000} formatCurrency={fmt} />);
    expect(screen.getByText('Comida')).toBeInTheDocument();
    expect(screen.getByText('Transporte')).toBeInTheDocument();
    expect(screen.getByText('Salud')).toBeInTheDocument();
    // Legend carries identity beyond color: percent + amount are present.
    expect(screen.getByText('40%')).toBeInTheDocument();
    expect(screen.getByText('$400')).toBeInTheDocument();
  });

  it('shows the grand total in the center when nothing is hovered', () => {
    render(<CategoryDonut slices={slices} total={1000} formatCurrency={fmt} />);
    expect(screen.getByText('Total')).toBeInTheDocument();
    expect(screen.getByText('$1000')).toBeInTheDocument();
  });

  it('draws one donut segment per slice', () => {
    const { container } = render(
      <CategoryDonut slices={slices} total={1000} formatCurrency={fmt} />
    );
    expect(container.querySelectorAll('circle')).toHaveLength(slices.length);
  });
});
