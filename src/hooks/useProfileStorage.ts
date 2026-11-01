import { useState, useEffect } from 'react';
import {
  Topic,
  Income,
  Expense,
  SavingGoal,
  SavingContribution,
  Withdrawal,
} from '../types';
import {
  initialTopics,
  initialIncomes,
  initialExpenses,
  initialSavingGoals,
  initialContributions,
} from '../initialData';

/**
 * Owns the per-profile financial state (topics, incomes, expenses, goals,
 * contributions, withdrawals, starting savings) backed by localStorage.
 *
 * The offline localStorage fallbacks only run when cloud sync is disabled,
 * exactly mirroring the original App.tsx behavior. State initializers and
 * persistence effects are preserved verbatim, including localStorage keys and
 * JSON parse/stringify logic.
 */
export function useProfileStorage(profile: string, syncEnabled: boolean) {
  // State Declarations keyed by current profile (will use local storage fallback when offline)
  const [topics, setTopics] = useState<Topic[]>(() => {
    const local = localStorage.getItem(`p_topics_${profile}`);
    if (local) return JSON.parse(local);
    return initialTopics;
  });

  const [incomes, setIncomes] = useState<Income[]>(() => {
    const local = localStorage.getItem(`p_incomes_${profile}`);
    if (local) return JSON.parse(local);
    return initialIncomes;
  });

  const [expenses, setExpenses] = useState<Expense[]>(() => {
    const local = localStorage.getItem(`p_expenses_${profile}`);
    if (local) return JSON.parse(local);
    return initialExpenses;
  });

  const [goals, setGoals] = useState<SavingGoal[]>(() => {
    const local = localStorage.getItem(`p_goals_${profile}`);
    if (local) return JSON.parse(local);
    return initialSavingGoals;
  });

  const [contributions, setContributions] = useState<SavingContribution[]>(
    () => {
      const local = localStorage.getItem(`p_contributions_${profile}`);
      if (local) return JSON.parse(local);
      return initialContributions;
    }
  );

  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>(() => {
    const local = localStorage.getItem(`p_withdrawals_${profile}`);
    if (local) return JSON.parse(local);
    return [];
  });

  const [startingSavings, setStartingSavings] = useState<number>(() => {
    const local = localStorage.getItem(`p_starting_savings_${profile}`);
    if (local) return parseFloat(local);
    return 1000;
  });

  // Always update LocalStorage as a fallback cache, even when sync is enabled
  useEffect(() => {
    localStorage.setItem(`p_topics_${profile}`, JSON.stringify(topics));
  }, [topics, profile, syncEnabled]);

  useEffect(() => {
    localStorage.setItem(`p_incomes_${profile}`, JSON.stringify(incomes));
  }, [incomes, profile, syncEnabled]);

  useEffect(() => {
    localStorage.setItem(`p_expenses_${profile}`, JSON.stringify(expenses));
  }, [expenses, profile, syncEnabled]);

  useEffect(() => {
    localStorage.setItem(`p_goals_${profile}`, JSON.stringify(goals));
  }, [goals, profile, syncEnabled]);

  useEffect(() => {
    localStorage.setItem(
      `p_contributions_${profile}`,
      JSON.stringify(contributions)
    );
  }, [contributions, profile, syncEnabled]);

  useEffect(() => {
    localStorage.setItem(
      `p_withdrawals_${profile}`,
      JSON.stringify(withdrawals)
    );
  }, [withdrawals, profile, syncEnabled]);

  useEffect(() => {
    localStorage.setItem(
      `p_starting_savings_${profile}`,
      startingSavings.toString()
    );
  }, [startingSavings, profile, syncEnabled]);

  return {
    topics,
    setTopics,
    incomes,
    setIncomes,
    expenses,
    setExpenses,
    goals,
    setGoals,
    contributions,
    setContributions,
    withdrawals,
    setWithdrawals,
    startingSavings,
    setStartingSavings,
  };
}
