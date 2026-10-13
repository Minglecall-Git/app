/**
 * Curated high-definition avatar collections and reliable fallbacks
 */

export interface AvatarCategory {
  id: string;
  label: string;
  icon: string;
  avatars: { url: string; label: string }[];
}

export const FEMALE_PORTRAIT_AVATARS = [
  {
    url: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=400',
    label: 'Valentina',
  },
  {
    url: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&q=80&w=400',
    label: 'Elena',
  },
  {
    url: 'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&q=80&w=400',
    label: 'Sofia',
  },
  {
    url: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&q=80&w=400',
    label: 'Amara',
  },
  {
    url: 'https://images.unsplash.com/photo-1529626455594-4ff0802cfb7e?auto=format&fit=crop&q=80&w=400',
    label: 'Mia',
  },
  {
    url: 'https://images.unsplash.com/photo-1531746020798-e6953c6e8e04?auto=format&fit=crop&q=80&w=400',
    label: 'Zendaya',
  },
  {
    url: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&q=80&w=400',
    label: 'Camila',
  },
  {
    url: 'https://images.unsplash.com/photo-1488426862026-3ee34a7d66df?auto=format&fit=crop&q=80&w=400',
    label: 'Isabella',
  },
  {
    url: 'https://images.unsplash.com/photo-1508214751196-bcfd4ca60f91?auto=format&fit=crop&q=80&w=400',
    label: 'Chloe',
  },
  {
    url: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&q=80&w=400',
    label: 'Natasha',
  },
  {
    url: 'https://images.unsplash.com/photo-1580489944761-15a19d654956?auto=format&fit=crop&q=80&w=400',
    label: 'Aria',
  },
  {
    url: 'https://images.unsplash.com/photo-1567532939604-b6b5b0db2604?auto=format&fit=crop&q=80&w=400',
    label: 'Yuki',
  },
];

export const MALE_PORTRAIT_AVATARS = [
  {
    url: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&q=80&w=400',
    label: 'Lucas (Handsome Casual)',
  },
  {
    url: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&q=80&w=400',
    label: 'Daniel (Modern Professional)',
  },
  {
    url: 'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?auto=format&fit=crop&q=80&w=400',
    label: 'Mateo (Creative Youth)',
  },
  {
    url: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&q=80&w=400',
    label: 'Alexander (Studio Portrait)',
  },
  {
    url: 'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?auto=format&fit=crop&q=80&w=400',
    label: 'Gabriel (Executive Suit)',
  },
  {
    url: 'https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?auto=format&fit=crop&q=80&w=400',
    label: 'Ethan (Urban Lifestyle)',
  },
];

export const TEAM_LEADER_AVATARS = [
  {
    url: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&q=80&w=400',
    label: 'Elena Rostova (Executive)',
  },
  {
    url: 'https://images.unsplash.com/photo-1580489944761-15a19d654956?auto=format&fit=crop&q=80&w=400',
    label: 'Sarah Jenkins (Director)',
  },
  {
    url: 'https://images.unsplash.com/photo-1560250097-0b93528c311a?auto=format&fit=crop&q=80&w=400',
    label: 'Marcus Vance (Guild Lead)',
  },
  {
    url: 'https://images.unsplash.com/photo-1573497019940-1c28c88b4f3e?auto=format&fit=crop&q=80&w=400',
    label: 'Diane Dupont (Agency Partner)',
  },
  {
    url: 'https://images.unsplash.com/photo-1573496799652-408c2ac9fe98?auto=format&fit=crop&q=80&w=400',
    label: 'Clara Sterling (Talent Mgr)',
  },
  {
    url: 'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?auto=format&fit=crop&q=80&w=400',
    label: 'Alexander Cross (Producer)',
  },
];

export const STYLIZED_3D_AVATARS = [
  {
    url: 'https://api.dicebear.com/7.x/personas/svg?seed=Valentina&backgroundColor=b6e3f4,c0aede,d1d4f9,ffd5dc,ffdfbf',
    label: 'Aura 3D',
  },
  {
    url: 'https://api.dicebear.com/7.x/personas/svg?seed=ElenaR&backgroundColor=ffdfbf,ffd5dc,d1d4f9',
    label: 'Glow 3D',
  },
  {
    url: 'https://api.dicebear.com/7.x/personas/svg?seed=SofiaV&backgroundColor=b6e3f4,c0aede',
    label: 'Cyber 3D',
  },
  {
    url: 'https://api.dicebear.com/7.x/personas/svg?seed=Amara&backgroundColor=ffd5dc,ffdfbf',
    label: 'Luna 3D',
  },
  {
    url: 'https://api.dicebear.com/7.x/personas/svg?seed=Nova&backgroundColor=c0aede,d1d4f9',
    label: 'Nova 3D',
  },
  {
    url: 'https://api.dicebear.com/7.x/personas/svg?seed=Ruby&backgroundColor=ffd5dc,b6e3f4',
    label: 'Ruby 3D',
  },
  {
    url: 'https://api.dicebear.com/7.x/lorelei/svg?seed=Bella&backgroundColor=b6e3f4,c0aede,ffd5dc',
    label: 'Lorelei Bella',
  },
  {
    url: 'https://api.dicebear.com/7.x/lorelei/svg?seed=Jade&backgroundColor=ffdfbf,ffd5dc',
    label: 'Lorelei Jade',
  },
];

export const ILLUSTRATED_ANIME_AVATARS = [
  {
    url: 'https://api.dicebear.com/7.x/adventurer/svg?seed=Host1&backgroundColor=b6e3f4,c0aede,ffd5dc',
    label: 'Adventurer 1',
  },
  {
    url: 'https://api.dicebear.com/7.x/adventurer/svg?seed=Host2&backgroundColor=ffd5dc,ffdfbf',
    label: 'Adventurer 2',
  },
  {
    url: 'https://api.dicebear.com/7.x/adventurer/svg?seed=Host3&backgroundColor=c0aede,d1d4f9',
    label: 'Adventurer 3',
  },
  {
    url: 'https://api.dicebear.com/7.x/micah/svg?seed=CreatorA&backgroundColor=b6e3f4,ffd5dc',
    label: 'Minimalist 1',
  },
  {
    url: 'https://api.dicebear.com/7.x/micah/svg?seed=CreatorB&backgroundColor=ffd5dc,ffdfbf',
    label: 'Minimalist 2',
  },
  {
    url: 'https://api.dicebear.com/7.x/micah/svg?seed=CreatorC&backgroundColor=c0aede,b6e3f4',
    label: 'Minimalist 3',
  },
];

/**
 * Returns a guaranteed working fallback image URL based on name, gender, or role
 */
export function getFallbackAvatar(name?: string, gender?: string, role?: string): string {
  const cleanName = encodeURIComponent(name?.trim() || 'User');
  if (role === 'team_leader' || role === 'agency_manager') {
    return `https://ui-avatars.com/api/?name=${cleanName}&background=f59e0b&color=09090b&bold=true&size=400`;
  }
  if (role === 'admin') {
    return `https://ui-avatars.com/api/?name=${cleanName}&background=ef4444&color=ffffff&bold=true&size=400`;
  }
  if (gender === 'female' || role === 'female_creator' || role === 'female_host') {
    return `https://ui-avatars.com/api/?name=${cleanName}&background=f43f5e&color=ffffff&bold=true&size=400`;
  }
  return `https://ui-avatars.com/api/?name=${cleanName}&background=6366f1&color=ffffff&bold=true&size=400`;
}
