import { differenceInDays } from 'date-fns';

export function computeRedFlags(client) {
  const flags = [];
  const now = new Date();

  // 1. Waiting on lead list
  if (client.waiting_on_leads && client.waiting_since) {
    const days = differenceInDays(now, new Date(client.waiting_since));
    if (days >= 4) {
      flags.push({ type: 'waiting_leads', severity: 'red', message: `Waiting ${days}d for lead list`, emoji: '⛔', days });
    } else if (days >= 2) {
      flags.push({ type: 'waiting_leads', severity: 'yellow', message: `Waiting ${days}d for lead list`, emoji: '⛔', days });
    }
  }

  // 2. No AM touchpoint
  if (client.last_am_touchpoint) {
    const days = differenceInDays(now, new Date(client.last_am_touchpoint));
    if (days >= 5) {
      flags.push({ type: 'no_touchpoint', severity: 'red', message: `No AM touchpoint for ${days} days`, emoji: '🕒', days });
    } else if (days >= 3) {
      flags.push({ type: 'no_touchpoint', severity: 'yellow', message: `No AM touchpoint for ${days} days`, emoji: '🕒', days });
    }
  }

  // 3. Unhappy > 10 days
  if (client.client_sentiment === 'Unhappy' && client.unhappy_since) {
    const days = differenceInDays(now, new Date(client.unhappy_since));
    if (days >= 10) {
      flags.push({ type: 'unhappy_long', severity: 'red', message: `Unhappy for ${days} days`, emoji: '😡', days });
    }
  }

  // 4. Lead volume below target
  if (client.target_leads_per_week > 0 && client.leads_this_week !== undefined && client.leads_this_week !== null) {
    const ratio = client.leads_this_week / client.target_leads_per_week;
    if (ratio < 0.5) {
      flags.push({ type: 'low_leads', severity: 'red', message: `Leads at ${Math.round(ratio * 100)}% of target`, emoji: '📉', ratio });
    } else if (ratio < 0.7) {
      flags.push({ type: 'low_leads', severity: 'yellow', message: `Leads at ${Math.round(ratio * 100)}% of target`, emoji: '📉', ratio });
    }
  }

  // 5. Escalated
  if (client.is_escalated) {
    flags.push({ type: 'escalated', severity: 'red', message: 'Client escalated', emoji: '⚠️' });
  }

  return flags;
}

export function computeAutoStatus(client) {
  const flags = computeRedFlags(client);
  if (client.is_escalated || flags.some(f => f.severity === 'red')) return 'Critical';
  if (flags.some(f => f.severity === 'yellow')) return 'At Risk';
  return client.status || 'Healthy';
}

export const STATUS_CONFIG = {
  'Healthy': { color: 'text-green-400', bg: 'bg-green-500/10', border: 'border-green-500/20', dot: 'bg-green-400' },
  'Monitor':  { color: 'text-yellow-400', bg: 'bg-yellow-500/10', border: 'border-yellow-500/20', dot: 'bg-yellow-400' },
  'At Risk':  { color: 'text-orange-400', bg: 'bg-orange-500/10', border: 'border-orange-500/20', dot: 'bg-orange-400' },
  'Critical': { color: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/20', dot: 'bg-red-400' },
};

export const SENTIMENT_CONFIG = {
  'Happy':             { color: 'text-green-400',  bg: 'bg-green-500/10',  emoji: '😊' },
  'Neutral':           { color: 'text-gray-400',   bg: 'bg-gray-500/10',   emoji: '😐' },
  'Slightly Concerned':{ color: 'text-yellow-400', bg: 'bg-yellow-500/10', emoji: '😟' },
  'Unhappy':           { color: 'text-red-400',    bg: 'bg-red-500/10',    emoji: '😡' },
};

export const PACKAGE_CONFIG = {
  'PPL':     { color: 'text-blue-400',   bg: 'bg-blue-500/10' },
  'Retainer':{ color: 'text-purple-400', bg: 'bg-purple-500/10' },
  'Hybrid':  { color: 'text-cyan-400',   bg: 'bg-cyan-500/10' },
};