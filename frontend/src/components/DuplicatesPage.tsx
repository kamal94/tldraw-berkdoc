import { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { duplicatesApi, type DuplicateResponseDto } from '../api/duplicates';
import { documentsApi, type Document } from '../api/documents';

interface DuplicateWithDocuments {
  duplicate: DuplicateResponseDto;
  sourceDocument: Document | null;
  targetDocument: Document | null;
}

interface DuplicatesPageProps {
  onBack: () => void;
}

export function DuplicatesPage({ onBack }: DuplicatesPageProps) {
  const { user } = useAuth();
  const [duplicates, setDuplicates] = useState<DuplicateWithDocuments[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.id) {
      setError('User not authenticated');
      setLoading(false);
      return;
    }

    const fetchDuplicates = async () => {
      try {
        setLoading(true);
        setError(null);

        // Fetch duplicates
        const duplicateList = await duplicatesApi.getDuplicatesForUser(user.id);

        // Fetch document details for each duplicate pair
        const duplicatesWithDocs = await Promise.all(
          duplicateList.map(async (duplicate) => {
            try {
              const [sourceDoc, targetDoc] = await Promise.all([
                documentsApi.findOne(duplicate.sourceDocumentId).catch(() => null),
                documentsApi.findOne(duplicate.targetDocumentId).catch(() => null),
              ]);

              return {
                duplicate,
                sourceDocument: sourceDoc,
                targetDocument: targetDoc,
              };
            } catch (err) {
              console.error('Error fetching document details:', err);
              return {
                duplicate,
                sourceDocument: null,
                targetDocument: null,
              };
            }
          })
        );

        setDuplicates(duplicatesWithDocs);
      } catch (err) {
        console.error('Error fetching duplicates:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch duplicates');
      } finally {
        setLoading(false);
      }
    };

    fetchDuplicates();
  }, [user?.id]);

  const handleDocumentClick = (url: string | undefined) => {
    if (url) {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  };

  if (loading) {
    return (
      <div style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#ffffff' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>Loading duplicates...</div>
          <div style={{ color: '#666' }}>Fetching duplicate documents</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#ffffff' }}>
        <div style={{ textAlign: 'center', color: '#dc2626' }}>
          <div style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>Error</div>
          <div style={{ marginBottom: '1rem' }}>{error}</div>
          <button
            onClick={onBack}
            style={{
              padding: '0.5rem 1rem',
              backgroundColor: '#4f46e5',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '14px',
            }}
          >
            Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: '#ffffff', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ padding: '1rem 2rem', borderBottom: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 600, margin: 0, color: '#111827' }}>
          Duplicate Documents
        </h1>
        <button
          onClick={onBack}
          style={{
            padding: '0.5rem 1rem',
            backgroundColor: '#f3f4f6',
            color: '#374151',
            border: '1px solid #d1d5db',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: 500,
          }}
        >
          Back to Board
        </button>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: 'auto', padding: '2rem' }}>
        {duplicates.length === 0 ? (
          <div style={{ textAlign: 'center', color: '#6b7280', padding: '3rem' }}>
            <div style={{ fontSize: '1.25rem', marginBottom: '0.5rem' }}>No duplicates found</div>
            <div>All your documents are unique</div>
          </div>
        ) : (
          <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
            <div style={{ marginBottom: '1rem', color: '#6b7280', fontSize: '14px' }}>
              Found {duplicates.length} duplicate pair{duplicates.length !== 1 ? 's' : ''}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {duplicates.map((item) => {
                const sourceTitle = item.sourceDocument?.title || item.duplicate.sourceDocumentId;
                const targetTitle = item.targetDocument?.title || item.duplicate.targetDocumentId;
                const sourceUrl = item.sourceDocument?.url;
                const targetUrl = item.targetDocument?.url;
                const similarityPercent = Math.round(item.duplicate.similarityScore * 100);

                return (
                  <div
                    key={item.duplicate.id}
                    style={{
                      padding: '1rem',
                      border: '1px solid #e5e7eb',
                      borderRadius: '8px',
                      backgroundColor: '#ffffff',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '1rem',
                    }}
                  >
                    {/* Source Document */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {sourceUrl ? (
                        <a
                          href={sourceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => {
                            e.preventDefault();
                            handleDocumentClick(sourceUrl);
                          }}
                          style={{
                            color: '#2563eb',
                            textDecoration: 'none',
                            fontWeight: 500,
                            display: 'block',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            cursor: 'pointer',
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.textDecoration = 'underline';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.textDecoration = 'none';
                          }}
                        >
                          {sourceTitle}
                        </a>
                      ) : (
                        <div
                          style={{
                            color: '#374151',
                            fontWeight: 500,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {sourceTitle}
                        </div>
                      )}
                    </div>

                    {/* Arrow and Similarity */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
                      <div style={{ color: '#9ca3af', fontSize: '14px' }}>↔</div>
                      <div style={{ color: '#6b7280', fontSize: '12px', whiteSpace: 'nowrap' }}>
                        {similarityPercent}%
                      </div>
                    </div>

                    {/* Target Document */}
                    <div style={{ flex: 1, minWidth: 0, textAlign: 'right' }}>
                      {targetUrl ? (
                        <a
                          href={targetUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => {
                            e.preventDefault();
                            handleDocumentClick(targetUrl);
                          }}
                          style={{
                            color: '#2563eb',
                            textDecoration: 'none',
                            fontWeight: 500,
                            display: 'block',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            cursor: 'pointer',
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.textDecoration = 'underline';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.textDecoration = 'none';
                          }}
                        >
                          {targetTitle}
                        </a>
                      ) : (
                        <div
                          style={{
                            color: '#374151',
                            fontWeight: 500,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {targetTitle}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
