import {
  Percent, ShoppingCart, Users, Sparkles, UserPlus, Layers, ShoppingBag, CalendarDays,
  Clock, Smartphone, MapPin, Gift, Tag
} from "lucide-react";

const ICONS = {
  percent: Percent,
  cart: ShoppingCart,
  users: Users,
  sparkles: Sparkles,
  userplus: UserPlus,
  layers: Layers,
  bag: ShoppingBag,
  calendar: CalendarDays,
  clock: Clock,
  phone: Smartphone,
  pin: MapPin,
  gift: Gift
};

// describeRules() içindeki ikon adını lucide ikonuna çevirir.
export const RuleIcon = ({ name }) => {
  const Icon = ICONS[name] || Tag;
  return <Icon aria-hidden="true" />;
};
