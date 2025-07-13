import React, { useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Alert,
  SafeAreaView,
  StatusBar,
  Dimensions,
  Image,
} from 'react-native';
import { useMedia, MediaItem } from '../context/MediaContext';

const { width } = Dimensions.get('window');
const itemWidth = (width - 48) / 2; // 2 columns with padding

const Trash: React.FC = () => {
  const {
    trashedItems,
    restoreFromTrash,
    deleteFromTrash,
    deleteBatchFromTrash,
  } = useMedia();
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [selectionMode, setSelectionMode] = useState(false);

  const handleItemPress = (item: MediaItem) => {
    if (selectionMode) {
      const newSelection = new Set(selectedItems);
      if (newSelection.has(item.id)) {
        newSelection.delete(item.id);
      } else {
        newSelection.add(item.id);
      }
      setSelectedItems(newSelection);

      if (newSelection.size === 0) {
        setSelectionMode(false);
      }
    } else {
      // Show single item actions
      showItemActions(item);
    }
  };

  const handleItemLongPress = (item: MediaItem) => {
    setSelectionMode(true);
    setSelectedItems(new Set([item.id]));
  };

  const showItemActions = (item: MediaItem) => {
    Alert.alert(
      'Item Actions',
      `What would you like to do with ${item.filename}?\n\nNote: iOS will ask for confirmation when deleting.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Restore',
          onPress: () => restoreFromTrash(item),
          style: 'default',
        },
        {
          text: 'Delete Permanently',
          onPress: async () => {
            try {
              await deleteFromTrash(item);
            } catch (error) {
              Alert.alert(
                'Deletion Complete',
                'Item has been removed from the app. It may still exist in your device gallery if deletion was not permitted.',
                [{ text: 'OK' }],
              );
            }
          },
          style: 'destructive',
        },
      ],
    );
  };

  const confirmDelete = (items: MediaItem[]) => {
    const itemCount = items.length;
    Alert.alert(
      'Delete Permanently',
      `Are you sure you want to permanently delete ${itemCount} item${
        itemCount > 1 ? 's' : ''
      }? This action cannot be undone.\n\nNote: iOS will show one confirmation dialog for all items.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Permanently',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteBatchFromTrash(items);
              setSelectedItems(new Set());
              setSelectionMode(false);
            } catch (error) {
              // Items are removed from trash even if device deletion fails
              setSelectedItems(new Set());
              setSelectionMode(false);
              Alert.alert(
                'Deletion Complete',
                'Items have been removed from the app. Some items may still exist in your device gallery if deletion was not permitted.',
                [{ text: 'OK' }],
              );
            }
          },
        },
      ],
    );
  };

  const handleBulkRestore = () => {
    const itemsToRestore = trashedItems.filter(item =>
      selectedItems.has(item.id),
    );
    itemsToRestore.forEach(item => restoreFromTrash(item));
    setSelectedItems(new Set());
    setSelectionMode(false);
  };

  const handleBulkDelete = () => {
    const itemsToDelete = trashedItems.filter(item =>
      selectedItems.has(item.id),
    );
    confirmDelete(itemsToDelete);
  };

  const handleDeleteAll = () => {
    Alert.alert(
      'Delete All Items',
      `Are you sure you want to permanently delete all ${trashedItems.length} items in trash? This action cannot be undone.\n\nNote: iOS will show one confirmation dialog for all items.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete All',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteBatchFromTrash(trashedItems);
              setSelectedItems(new Set());
              setSelectionMode(false);
            } catch (error) {
              // Items are removed from trash even if device deletion fails
              setSelectedItems(new Set());
              setSelectionMode(false);
              Alert.alert(
                'Deletion Complete',
                'Items have been removed from the app. Some items may still exist in your device gallery if deletion was not permitted.',
                [{ text: 'OK' }],
              );
            }
          },
        },
      ],
    );
  };

  const cancelSelection = () => {
    setSelectedItems(new Set());
    setSelectionMode(false);
  };

  const renderItem = ({ item }: { item: MediaItem }) => {
    const isSelected = selectedItems.has(item.id);

    return (
      <TouchableOpacity
        style={[styles.itemContainer, isSelected && styles.selectedItem]}
        onPress={() => handleItemPress(item)}
        onLongPress={() => handleItemLongPress(item)}
      >
        <Image
          source={{ uri: item.uri }}
          style={styles.itemImage}
          resizeMode="cover"
        />

        {/* Video indicator */}
        {item.type === 'video' && (
          <View style={styles.videoIndicator}>
            <Text style={styles.videoIcon}>▶</Text>
          </View>
        )}

        {/* Selection indicator */}
        {selectionMode && (
          <View style={styles.selectionIndicator}>
            <View style={[styles.checkbox, isSelected && styles.checkedBox]}>
              {isSelected && <Text style={styles.checkmark}>✓</Text>}
            </View>
          </View>
        )}

        {/* Item info */}
        <View style={styles.itemInfo}>
          <Text style={styles.itemSource}>{item.source}</Text>
          <Text style={styles.itemDate}>
            {new Date(item.timestamp).toLocaleDateString()}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>
          {selectionMode ? `${selectedItems.size} selected` : 'Trash'}
        </Text>
        <View style={styles.headerActions}>
          {selectionMode ? (
            <TouchableOpacity onPress={cancelSelection}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          ) : (
            trashedItems.length > 0 && (
              <TouchableOpacity
                onPress={handleDeleteAll}
                style={styles.deleteAllButton}
              >
                <Text style={styles.deleteAllText}>Delete All</Text>
              </TouchableOpacity>
            )
          )}
        </View>
      </View>

      {/* Content */}
      {trashedItems.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyIcon}>🗑️</Text>
          <Text style={styles.emptyTitle}>Trash is Empty</Text>
          <Text style={styles.emptyText}>
            Items you choose to trash will appear here. You can restore them or
            delete them permanently.
          </Text>
        </View>
      ) : (
        <FlatList
          data={trashedItems}
          renderItem={renderItem}
          keyExtractor={item => item.id}
          numColumns={2}
          contentContainerStyle={styles.listContainer}
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* Bottom Actions */}
      {selectionMode && selectedItems.size > 0 && (
        <View style={styles.actionsContainer}>
          <TouchableOpacity
            style={[styles.actionButton, styles.restoreButton]}
            onPress={handleBulkRestore}
          >
            <Text style={styles.actionButtonText}>
              ↩ Restore ({selectedItems.size})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionButton, styles.deleteButton]}
            onPress={handleBulkDelete}
          >
            <Text style={styles.actionButtonText}>
              🗑 Delete ({selectedItems.size})
            </Text>
          </TouchableOpacity>
        </View>
      )}
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
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e9ecef',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#212529',
  },
  cancelText: {
    fontSize: 16,
    color: '#007bff',
    fontWeight: '600',
  },
  listContainer: {
    padding: 16,
  },
  itemContainer: {
    width: itemWidth,
    marginBottom: 16,
    marginRight: 16,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#f8f9fa',
  },
  selectedItem: {
    borderWidth: 3,
    borderColor: '#007bff',
  },
  itemImage: {
    width: '100%',
    height: itemWidth,
  },
  videoIndicator: {
    position: 'absolute',
    top: 8,
    left: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    borderRadius: 12,
    padding: 4,
  },
  videoIcon: {
    color: '#ffffff',
    fontSize: 12,
  },
  selectionIndicator: {
    position: 'absolute',
    top: 8,
    right: 8,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#ffffff',
  },
  checkedBox: {
    backgroundColor: '#007bff',
  },
  checkmark: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '600',
  },
  itemInfo: {
    padding: 12,
  },
  itemSource: {
    fontSize: 12,
    fontWeight: '600',
    color: '#495057',
    marginBottom: 4,
  },
  itemDate: {
    fontSize: 10,
    color: '#6c757d',
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
  actionsContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 16,
    backgroundColor: '#f8f9fa',
    borderTopWidth: 1,
    borderTopColor: '#e9ecef',
  },
  actionButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginHorizontal: 4,
  },
  restoreButton: {
    backgroundColor: '#28a745',
  },
  deleteButton: {
    backgroundColor: '#dc3545',
  },
  actionButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  deleteAllButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#dc3545',
    borderRadius: 8,
  },
  deleteAllText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
});

export default Trash;
