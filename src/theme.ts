// Серо-жёлтая палитра, как на визитке и лендинге
export const colors = {
  bg: '#1a1b1e',
  bg2: '#202125',
  surface: '#26282c',
  card: '#2e3035',
  border: 'rgba(255,255,255,0.08)',
  borderStrong: 'rgba(255,255,255,0.14)',
  text: '#e6e6e8',
  muted: '#a3a5ab',
  dim: '#6b6e75',
  yellow1: '#ffe36e',
  yellow: '#ffc61a',
  yellow3: '#f0a500',
  ink: '#1a1b1e',
  success: '#5fd38d',
  danger: '#ff6b6b',
  info: '#7aa7ff',
};

export const gradients = {
  gold: ['#ffe36e', '#ffc61a', '#f0a500'] as const,
  title: ['#e6e6e8', '#ffe36e', '#ffc61a'] as const,
};

export const radius = { sm: 10, md: 16, lg: 22, xl: 28 };

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 };

export const statusMeta = {
  planned: { label: 'Запланирована', color: colors.yellow, icon: 'time-outline' },
  done: { label: 'Пришла', color: colors.success, icon: 'checkmark-circle-outline' },
  no_show: { label: 'Не пришла', color: colors.danger, icon: 'close-circle-outline' },
  cancelled: { label: 'Отменена', color: colors.dim, icon: 'ban-outline' },
} as const;
