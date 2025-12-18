// Test file to debug month progress tracking

// Mock data
const mockMonthItems = [
  { id: '1', uri: 'photo1.jpg' },
  { id: '2', uri: 'photo2.jpg' },
  { id: '3', uri: 'photo3.jpg' },
  { id: '4', uri: 'photo4.jpg' },
  { id: '5', uri: 'photo5.jpg' },
];

// Test the progress calculation
function testProgressCalculation() {
  // Test 1: View 1 out of 5 photos
  const viewedCount1 = 1;
  const totalItems1 = mockMonthItems.length;
  const percentage1 =
    totalItems1 > 0 ? Math.round((viewedCount1 / totalItems1) * 100) : 0;

  // Test 2: View 3 out of 5 photos
  const viewedCount2 = 3;
  const percentage2 =
    totalItems1 > 0 ? Math.round((viewedCount2 / totalItems1) * 100) : 0;

  // Test 3: View all 5 photos
  const viewedCount3 = 5;
  const percentage3 =
    totalItems1 > 0 ? Math.round((viewedCount3 / totalItems1) * 100) : 0;

  // Test edge cases
  const emptyMonth = 0 > 0 ? Math.round((1 / 0) * 100) : 0;
  const singlePhoto = 1 > 0 ? Math.round((1 / 1) * 100) : 0;
}

// Test the MediaViewer photo tracking logic
function testPhotoTracking() {
  const initialIndex = 0;
  const viewedPhotos = new Set([initialIndex]);

  // Simulate viewing photo at index 2
  viewedPhotos.add(2);

  // Simulate viewing photo at index 4
  viewedPhotos.add(4);

  const totalViewed = viewedPhotos.size;
  const percentage = Math.round((viewedPhotos.size / mockMonthItems.length) * 100);
}

// Test the markMonthAsViewed function logic
function testMarkMonthAsViewed() {
  const monthKey = '2024-01';
  const viewedCount = 2; // User viewed 2 photos
  const totalItems = mockMonthItems.length;
  const percentage =
    totalItems > 0 ? Math.round((viewedCount / totalItems) * 100) : 0;

  // This should be called when viewer closes
  const result = {
    monthKey,
    viewedCount,
    percentage,
  };
}

// Test the current issue - why it's showing 100%
function testCurrentIssue() {
  // Simulate what happens when opening a month
  const viewedPhotos = new Set([0, 1, 2]); // User viewed 3 photos
  const totalPhotos = 5;
  const actualViewedCount = viewedPhotos.size;
  const percentage = Math.round((actualViewedCount / totalPhotos) * 100);
}

// Run all tests
testProgressCalculation();
testPhotoTracking();
testMarkMonthAsViewed();
testCurrentIssue();
