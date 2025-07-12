import { CameraRoll } from '@react-native-camera-roll/camera-roll';
import { MediaItem } from '../context/MediaContext';

const inferSourceFromPath = (uri: string): string => {
  const path = uri.toLowerCase();

  if (path.includes('whatsapp')) return 'WhatsApp';
  if (path.includes('camera')) return 'Camera';
  if (path.includes('screenshot')) return 'Screenshot';
  if (path.includes('download')) return 'Downloads';
  if (path.includes('instagram')) return 'Instagram';
  if (path.includes('telegram')) return 'Telegram';
  if (path.includes('facebook')) return 'Facebook';
  if (path.includes('snapchat')) return 'Snapchat';
  if (path.includes('dcim')) return 'Camera';

  return 'Gallery';
};

export const scanDeviceMedia = async (): Promise<MediaItem[]> => {
  try {
    console.log('Starting media scan...');

    const photos = await CameraRoll.getPhotos({
      first: 10000, // Get a large number of photos
      assetType: 'All',
      include: [
        'filename',
        'fileSize',
        'location',
        'playableDuration',
        'imageSize',
      ],
    });

    console.log('CameraRoll.getPhotos result:', {
      totalCount: photos.page_info.has_next_page
        ? 'has more'
        : photos.edges.length,
      edgesCount: photos.edges.length,
      firstEdge: photos.edges[0],
    });

    const mediaItems: MediaItem[] = photos.edges.map((edge, index) => {
      const { node } = edge;
      const source = inferSourceFromPath(node.image.uri);

      console.log(`Processing item ${index}:`, {
        uri: node.image.uri,
        type: node.type,
        filename: node.image.filename,
        timestamp: node.timestamp,
        fileSize: node.image.fileSize,
        fullNode: JSON.stringify(node, null, 2), // Full node details
      });

      return {
        id: node.image.uri + index, // Use URI + index as unique ID
        uri: node.image.uri,
        type: node.type === 'video' ? 'video' : 'photo',
        timestamp: new Date(node.timestamp).getTime(),
        source,
        filename: node.image.filename || `media_${index}`,
        location: node.location
          ? `${node.location.latitude}, ${node.location.longitude}`
          : undefined,
        size: node.image.fileSize || undefined,
      };
    });

    console.log('Media scan complete. Found', mediaItems.length, 'items');
    console.log('Sample media items:', mediaItems.slice(0, 3));

    // Sort by timestamp (newest first)
    return mediaItems.sort((a, b) => b.timestamp - a.timestamp);
  } catch (error) {
    console.error('Error scanning device media:', error);
    return [];
  }
};
