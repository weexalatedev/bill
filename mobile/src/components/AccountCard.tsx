import { StyleSheet, Text, View } from 'react-native';
import { LogOut, ShieldCheck, UserCircle } from 'lucide-react-native';

import { useAuth } from '../lib/auth';
import { Badge, Button, Card } from '../components/ui';
import { colors, font, fontWeight, spacing } from '../theme';

/** Shows who is signed in and lets them sign out (shared credentials with web). */
export default function AccountCard() {
  const { user, mode, signOut } = useAuth();

  return (
    <Card>
      <View style={s.row}>
        <UserCircle size={20} color={colors.slate400} strokeWidth={2} />
        <View style={{ flex: 1 }}>
          <Text style={s.name}>{user?.name ?? 'Signed in'}</Text>
          <Text style={s.email}>{user?.email}</Text>
        </View>
      </View>

      <View style={s.badges}>
        <Badge tone={mode === 'clerk' ? 'violet' : 'slate'} Icon={ShieldCheck}>
          {mode === 'clerk' ? 'Clerk auth' : 'Dev auth'}
        </Badge>
      </View>

      <View style={{ marginTop: spacing.md }}>
        <Button
          label="Sign out"
          onPress={() => {
            void signOut();
          }}
          Icon={LogOut}
          variant="secondary"
          full
        />
      </View>
    </Card>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  name: { fontSize: font.base, fontWeight: fontWeight.semibold, color: colors.slate800 },
  email: { fontSize: font.sm, color: colors.slate500, marginTop: 2 },
  badges: { flexDirection: 'row', marginTop: spacing.md },
});
