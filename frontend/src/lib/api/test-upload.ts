// Test script to verify document upload request format
import documentService from './documents';

// Test the upload request format
async function testUploadRequest() {
  const testFile = new File(['test content'], 'test.pdf', { type: 'application/pdf' });
  
  const metadata = {
    category: 'contract' as const,
    description: 'Test document',
    tags: ['test', 'sample']
  };

  console.log('Testing upload request format...');
  
  // This will show us the exact request being sent
  const originalPost = document.querySelector('body')?.setAttribute('data-test', 'true');
  
  try {
    const result = await documentService.uploadDocument(testFile, metadata);
    console.log('Upload result:', result);
  } catch (error) {
    console.error('Upload test error:', error);
  }
}

// Export for manual testing
export { testUploadRequest };
