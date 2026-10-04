import { useState } from 'react';
import { Alert, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { Cloud, FileText, Loader2, Trash2 } from 'lucide-react-native';

import { useApp } from '../store';
import { Badge, Button, Card, SectionHeading } from '../components/ui';
import { colors, font, fontWeight, radius, spacing } from '../theme';

/**
 * Cloudflare R2 document store for invoice PDFs / photos. Mirrors the web
 * app's DocumentsCard — the same `uploadDocument` / `documentUrl` / `deleteUpload`
 * store methods hit the same `/api/uploads` endpoints.
 */
export default function DocumentsCard() {
  const { uploads, uploadDocument, deleteUpload, documentUrl, pushToast } = useApp();
  const [busy, setBusy] = useState(false);

  const pick = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'image/*'],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (result.canceled) return;
      const asset = result.assets?.[0];
      if (!asset) return;

      setBusy(true);
      await uploadDocument({
        uri: asset.uri,
        name: asset.name,
        type: asset.mimeType ?? 'application/octet-stream',
      });
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setBusy(false);
    }
  };

  const open = async (id: string) => {
    try {
      const url = await documentUrl(id);
      await Linking.openURL(url);
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Could not open document');
    }
  };

  const remove = (id: string, filename: string) => {
    Alert.alert('Delete document', `Remove ${filename} from Cloudflare R2?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          void deleteUpload(id).catch((err: unknown) =>
            pushToast(err instanceof Error ? err.message : 'Could not delete document'),
          );
        },
      },
    ]);
  };

  return (
    <Card>
      <SectionHeading
        title="Invoice documents"
        subtitle="PDFs and photos are stored in Cloudflare R2, scoped to your account."
        action={<Badge tone="sky">Cloudflare R2</Badge>}
      />

      <Button
        label={busy ? 'Uploading…' : 'Upload PDF or photo'}
        onPress={() => void pick()}
        Icon={busy ? Loader2 : Cloud}
        variant="secondary"
        disabled={busy}
      />

      {uploads.length === 0 ? (
        <Text style={s.empty}>No documents yet.</Text>
      ) : (
        <View style={s.list}>
          {uploads.map((upload) => (
            <View key={upload.id} style={s.row}>
              <FileText size={16} color={colors.slate400} strokeWidth={2} />
              <Pressable style={s.nameWrap} onPress={() => void open(upload.id)}>
                <Text style={s.name} numberOfLines={1}>
                  {upload.filename}
                </Text>
              </Pressable>
              <Text style={s.size}>{(upload.size / 1024).toFixed(0)} KB</Text>
              <Pressable
                onPress={() => remove(upload.id, upload.filename)}
                hitSlop={8}
                accessibilityLabel="Delete document"
              >
                <Trash2 size={16} color={colors.slate400} strokeWidth={2} />
              </Pressable>
            </View>
          ))}
        </View>
      )}
    </Card>
  );
}

const s = StyleSheet.create({
  empty: { fontSize: font.sm, color: colors.slate400, marginTop: spacing.md },
  list: { marginTop: spacing.md, gap: spacing.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.slate100,
    backgroundColor: colors.slate50,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  nameWrap: { flex: 1, minWidth: 0 },
  name: { fontSize: font.base, color: colors.slate700 },
  size: { fontSize: font.xs, color: colors.slate400 },
});
