import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  SectionList,
  TouchableOpacity,
  StyleSheet,
  Alert,
  SafeAreaView,
  StatusBar,
  Dimensions,
  Image,
  Modal,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useMedia } from '../context/MediaContext';
import { GhostEntry, ghostImageUri, ghostStats } from '../utils/ghostAlbum';
import { formatBytes, formatMonthKey } from '../utils/format';

const { width } = Dimensions.get('window');
const COLUMNS = 4;
const GRID_PADDING = 16;
const CELL_GAP = 6;
const CELL_SIZE = Math.floor(
  (width - GRID_PADDING * 2 - CELL_GAP * (COLUMNS - 1)) / COLUMNS,
);

interface GhostSection {
  title: string;
  monthKey: string;
  data: GhostEntry[][];
}

const chunk = <T,>(list: T[], size: number): T[][] => {
  const rows: T[][] = [];
  for (let i = 0; i < list.length; i += size) {
    rows.push(list.slice(i, i + size));
  }
  return rows;
};

const GhostAlbum: React.FC = () => {
  const navigation = useNavigation();
  const {
    ghosts,
    ghostAlbumEnabled,
    setGhostAlbumEnabled,
    removeGhost,
    wipeGhostAlbum,
  } = useMedia();
  const [selected, setSelected] = useState<GhostEntry | null>(null);

  const stats = useMemo(() => ghostStats(ghosts), [ghosts]);

  // Newest month first; within a month, newest original first
  const sections = useMemo<GhostSection[]>(() => {
    const byMonth = new Map<string, GhostEntry[]>();
    ghosts.forEach(entry => {
      const list = byMonth.get(entry.monthKey);
      if (list) {
        list.push(entry);
      } else {
        byMonth.set(entry.monthKey, [entry]);
      }
    });
    return Array.from(byMonth.entries())
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([monthKey, entries]) => ({
        title: formatMonthKey(monthKey),
        monthKey,
        data: chunk(
          [...entries].sort((a, b) => b.timestamp - a.timestamp),
          COLUMNS,
        ),
      }));
  }, [ghosts]);

  const handleMenu = () => {
    Alert.alert(
      'Ghost Album',
      ghostAlbumEnabled
        ? 'Every photo you permanently delete leaves a tiny ghost here.'
        : 'Ghosts are paused. Deleted photos are not remembered.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: ghostAlbumEnabled ? 'Pause ghosts' : 'Resume ghosts',
          onPress: () => setGhostAlbumEnabled(!ghostAlbumEnabled),
        },
        {
          text: 'Wipe all ghosts',
          style: 'destructive',
          onPress: confirmWipe,
        },
      ],
    );
  };

  const confirmWipe = () => {
    if (ghosts.length === 0) return;
    Alert.alert(
      'Wipe Ghost Album',
      `Remove all ${ghosts.length} ghosts? The photos themselves are already gone, so this cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Wipe',
          style: 'destructive',
          onPress: () => {
            setSelected(null);
            wipeGhostAlbum();
          },
        },
      ],
    );
  };

  const confirmRemove = (entry: GhostEntry) => {
    Alert.alert('Remove ghost', 'Forget this one for good?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => {
          setSelected(null);
          removeGhost(entry.ghostId);
        },
      },
    ]);
  };

  const renderRow = ({ item: row }: { item: GhostEntry[] }) => (
    <View style={styles.row}>
      {row.map(entry => (
        <TouchableOpacity
          key={entry.ghostId}
          style={styles.cell}
          activeOpacity={0.7}
          onPress={() => setSelected(entry)}
          accessibilityLabel={`Ghost of ${entry.filename}`}
        >
          <Image
            source={{ uri: ghostImageUri(entry) }}
            style={styles.thumb}
            resizeMode="cover"
          />
          <View style={styles.fade} pointerEvents="none" />
          {entry.type === 'video' && (
            <View style={styles.videoBadge} pointerEvents="none">
              <Text style={styles.videoBadgeText}>▶</Text>
            </View>
          )}
        </TouchableOpacity>
      ))}
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.headerButton}
          accessibilityLabel="Back"
        >
          <Text style={styles.headerButtonText}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Ghost Album</Text>
        <TouchableOpacity
          onPress={handleMenu}
          style={styles.headerButton}
          accessibilityLabel="Ghost Album options"
        >
          <Text style={styles.headerButtonText}>⋯</Text>
        </TouchableOpacity>
      </View>

      {/* Stats */}
      {ghosts.length > 0 && (
        <View style={styles.statsBar}>
          <View style={styles.stat}>
            <Text style={styles.statValue}>{stats.count}</Text>
            <Text style={styles.statLabel}>
              {stats.count === 1 ? 'ghost' : 'ghosts'}
            </Text>
          </View>
          {stats.bytesFreed > 0 && (
            <View style={styles.stat}>
              <Text style={styles.statValue}>
                {formatBytes(stats.bytesFreed)}
              </Text>
              <Text style={styles.statLabel}>freed</Text>
            </View>
          )}
        </View>
      )}

      {!ghostAlbumEnabled && (
        <View style={styles.pausedBanner}>
          <Text style={styles.pausedText}>
            Ghosts are paused. New deletions will not be remembered.
          </Text>
          <TouchableOpacity onPress={() => setGhostAlbumEnabled(true)}>
            <Text style={styles.pausedAction}>Resume</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Content */}
      {ghosts.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyIcon}>👻</Text>
          <Text style={styles.emptyTitle}>No ghosts yet</Text>
          <Text style={styles.emptyText}>
            When you permanently delete a photo or video, a tiny ghost of it is
            kept here. You will always be able to see what you let go, so you
            can delete without fear.
          </Text>
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={row => row.map(entry => entry.ghostId).join('|')}
          renderItem={renderRow}
          renderSectionHeader={({ section }) => (
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>{section.title}</Text>
              <Text style={styles.sectionCount}>
                {section.data.reduce((sum, row) => sum + row.length, 0)}
              </Text>
            </View>
          )}
          contentContainerStyle={styles.listContainer}
          stickySectionHeadersEnabled={false}
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* Ghost detail */}
      <Modal
        visible={selected !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setSelected(null)}
      >
        <View style={styles.modalBackdrop}>
          {selected && (
            <View style={styles.modalCard}>
              <Image
                source={{ uri: ghostImageUri(selected) }}
                style={styles.modalImage}
                resizeMode="contain"
              />
              <View style={styles.modalInfo}>
                <Text style={styles.modalTitle}>
                  {selected.type === 'video' ? 'Video' : 'Photo'} from{' '}
                  {new Date(selected.timestamp).toLocaleDateString()}
                </Text>
                <Text style={styles.modalLine}>
                  Deleted {new Date(selected.deletedAt).toLocaleDateString()}
                  {selected.size > 0
                    ? ` · freed ${formatBytes(selected.size)}`
                    : ''}
                </Text>
                <Text style={styles.modalHint}>
                  This is only a ghost. The original is gone.
                </Text>
              </View>
              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={[styles.modalButton, styles.modalRemove]}
                  onPress={() => confirmRemove(selected)}
                >
                  <Text style={styles.modalRemoveText}>Remove ghost</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalButton, styles.modalClose]}
                  onPress={() => setSelected(null)}
                >
                  <Text style={styles.modalCloseText}>Close</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e9ecef',
  },
  headerButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerButtonText: {
    fontSize: 28,
    color: '#212529',
    fontWeight: '600',
    lineHeight: 30,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#212529',
  },
  statsBar: {
    flexDirection: 'row',
    justifyContent: 'center',
    paddingVertical: 14,
    backgroundColor: '#f8f9fa',
    borderBottomWidth: 1,
    borderBottomColor: '#e9ecef',
  },
  stat: {
    alignItems: 'center',
    paddingHorizontal: 28,
  },
  statValue: {
    fontSize: 22,
    fontWeight: '800',
    color: '#212529',
  },
  statLabel: {
    fontSize: 12,
    color: '#6c757d',
    fontWeight: '600',
    marginTop: 2,
  },
  pausedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff3cd',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  pausedText: {
    flex: 1,
    color: '#664d03',
    fontSize: 13,
  },
  pausedAction: {
    color: '#007bff',
    fontWeight: '700',
    marginLeft: 12,
  },
  listContainer: {
    paddingHorizontal: GRID_PADDING,
    paddingBottom: 32,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    paddingTop: 20,
    paddingBottom: 10,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#212529',
  },
  sectionCount: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6c757d',
  },
  row: {
    flexDirection: 'row',
    marginBottom: CELL_GAP,
  },
  cell: {
    width: CELL_SIZE,
    height: CELL_SIZE,
    marginRight: CELL_GAP,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#e9ecef',
  },
  thumb: {
    width: '100%',
    height: '100%',
    opacity: 0.72,
  },
  fade: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
  },
  videoBadge: {
    position: 'absolute',
    top: 4,
    left: 4,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    borderRadius: 8,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  videoBadgeText: {
    color: '#ffffff',
    fontSize: 9,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#212529',
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 16,
    color: '#6c757d',
    textAlign: 'center',
    lineHeight: 24,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalCard: {
    width: '100%',
    backgroundColor: '#ffffff',
    borderRadius: 16,
    overflow: 'hidden',
  },
  modalImage: {
    width: '100%',
    height: width - 48,
    backgroundColor: '#111111',
    opacity: 0.85,
  },
  modalInfo: {
    padding: 16,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#212529',
    marginBottom: 4,
  },
  modalLine: {
    fontSize: 14,
    color: '#495057',
    marginBottom: 8,
  },
  modalHint: {
    fontSize: 12,
    color: '#6c757d',
    fontStyle: 'italic',
  },
  modalActions: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: '#e9ecef',
  },
  modalButton: {
    flex: 1,
    paddingVertical: 14,
    alignItems: 'center',
  },
  modalRemove: {
    borderRightWidth: 1,
    borderRightColor: '#e9ecef',
  },
  modalRemoveText: {
    color: '#dc3545',
    fontWeight: '700',
    fontSize: 15,
  },
  modalClose: {},
  modalCloseText: {
    color: '#007bff',
    fontWeight: '700',
    fontSize: 15,
  },
});

export default GhostAlbum;
