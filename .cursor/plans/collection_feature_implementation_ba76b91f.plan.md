---
name: Collection Feature Implementation
overview: Implement collections as groups of documents on the tldraw canvas, with a blue square background shape, shadow effect, and a text label. Collections will use both parentId relationships and a props list to track documents, and will auto-size to fit their contents.
todos:
  - id: "1"
    content: Add CollectionShapeProps type to shared/document-shape.types.ts
    status: completed
  - id: "2"
    content: Create CollectionShape.tsx with CollectionShapeUtil class
    status: completed
  - id: "3"
    content: Create CollectionBackground component for blue square with shadow
    status: completed
  - id: "4"
    content: Update backend schema in boards.room-manager.ts to include collection shape
    status: completed
  - id: "5"
    content: Register CollectionShapeUtil in App.tsx and useBoardSync.ts
    status: completed
  - id: "6"
    content: Create collection-utils.ts with helper functions (createCollection, addDocumentToCollection, calculateCollectionBounds)
    status: completed
  - id: "7"
    content: Create useCollectionAutoSize hook for reactive bounds calculation
    status: completed
  - id: "8"
    content: Add UI action to BoardActionsMenu for creating collections
    status: completed
---

# Collection Feature Implementation

## Overview

Add a "collection" feature that groups documents on the tldraw canvas. Each collection will have:

- A blue square background shape with shadow
- A text label (using tldraw's text shape)
- Auto-sizing to fit contained documents
- Both parentId relationships and a documentIds prop list

## Architecture

### Data Model

Collections will use a dual approach:

1. **Visual grouping**: Documents use `parentId` pointing to the collection shape
2. **Data tracking**: Collection shape maintains `documentIds` array in props

### Shape Types

- **Collection shape**: Custom shape type `"collection"` with blue background and shadow
- **Text label**: Uses tldraw's built-in `"text"` shape, positioned above the collection

## Implementation Steps

### 1. Define Collection Types

**File**: `shared/document-shape.types.ts`

- Add `CollectionShapeProps` interface:
  - `label: string` - Collection name
  - `documentIds: string[]` - Array of document shape IDs
  - `w: number` - Width (auto-calculated)
  - `h: number` - Height (auto-calculated)

### 2. Create Collection Shape Util (Frontend)

**File**: `frontend/src/shapes/CollectionShape.tsx`

- Create `CollectionShapeUtil` extending `ShapeUtil`
- Implement:
  - `getDefaultProps()`: Default collection props
  - `getGeometry()`: Rectangle geometry for the background
  - `component()`: Render blue square with shadow using HTMLContainer
  - `indicator()`: SVG indicator for selection
- Use blue background (`#3B82F6` or similar) with shadow effect
- Make it non-editable (like documents) or allow label editing

**File**: `frontend/src/shapes/CollectionBackground.tsx` (optional component)

- React component that renders the blue square with shadow
- Uses Tailwind classes for styling
- Handles shadow effect (box-shadow or multiple layers)

### 3. Update Backend Schema

**File**: `backend/src/boards/boards.room-manager.ts`

- Add `collectionShapeProps` validator:
  ```typescript
  const collectionShapeProps = {
    label: T.string,
    documentIds: T.arrayOf(T.string),
    w: T.number,
    h: T.number,
  } as const;
  ```

- Add `collection` to schema shapes:
  ```typescript
  collection: {
    props: collectionShapeProps,
  },
  ```


### 4. Register Collection Shape

**File**: `frontend/src/App.tsx`

- Import `CollectionShapeUtil`
- Add to `customShapeUtils` array: `[DocumentShapeUtil, CollectionShapeUtil]`

**File**: `frontend/src/hooks/useBoardSync.ts`

- Add `CollectionShapeUtil` to `shapeUtils` array

### 5. Create Collection Creation Logic

**File**: `frontend/src/utils/collection-utils.ts` (new file)

- `createCollection()`: Creates collection shape and text label
- `addDocumentToCollection()`: Adds document to collection (updates parentId and documentIds)
- `removeDocumentFromCollection()`: Removes document from collection
- `calculateCollectionBounds()`: Auto-calculates collection size based on document positions
- `updateCollectionSize()`: Updates collection dimensions when documents move

### 6. UI for Creating Collections

**File**: `frontend/src/components/BoardActionsMenu.tsx` or new component

- Add "Create Collection" action
- On click:

  1. Create collection shape at current viewport center
  2. Create text label shape above collection
  3. Set initial label (e.g., "New Collection")
  4. Allow user to edit label

### 7. Auto-sizing Logic

**File**: `frontend/src/hooks/useCollectionAutoSize.ts` (new hook)

- Monitor document positions within collection
- Recalculate collection bounds when:
  - Documents are added/removed
  - Documents are moved
  - Collection is created
- Update collection shape dimensions

### 8. Text Label Management

- When creating collection, create a text shape:
  - Type: `"text"` (tldraw built-in)
  - Position: Above collection background
  - Content: Collection label
  - Parent: Collection shape (optional, or keep on page)
- Keep label in sync with collection's label prop

## Technical Details

### Collection Background Styling

- Background color: `#3B82F6` (blue-500)
- Shadow: Multiple layers for depth effect
  - `box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)`
  - Or use Tailwind: `shadow-lg` or `shadow-xl`
- Border radius: Optional rounded corners (e.g., `rounded-lg`)

### Document Association Flow

1. User selects documents and creates collection
2. Collection shape created with initial bounds
3. Text label created and positioned
4. Documents' `parentId` set to collection shape ID
5. Collection's `documentIds` prop updated
6. Collection bounds recalculated to fit all documents

### Auto-sizing Algorithm

```typescript
function calculateCollectionBounds(documents: DocumentShape[]): { x, y, w, h } {
  if (documents.length === 0) return defaultBounds;
  
  const bounds = documents.reduce((acc, doc) => {
    return {
      minX: Math.min(acc.minX, doc.x),
      minY: Math.min(acc.minY, doc.y),
      maxX: Math.max(acc.maxX, doc.x + doc.props.w),
      maxY: Math.max(acc.maxY, doc.y + doc.props.h),
    };
  }, { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity });
  
  // Add padding
  const padding = 20;
  return {
    x: bounds.minX - padding,
    y: bounds.minY - padding,
    w: (bounds.maxX - bounds.minX) + (padding * 2),
    h: (bounds.maxY - bounds.minY) + (padding * 2),
  };
}
```

## Files to Create

1. `frontend/src/shapes/CollectionShape.tsx`
2. `frontend/src/shapes/CollectionBackground.tsx` (optional)
3. `frontend/src/utils/collection-utils.ts`
4. `frontend/src/hooks/useCollectionAutoSize.ts`

## Files to Modify

1. `shared/document-shape.types.ts` - Add CollectionShapeProps
2. `backend/src/boards/boards.room-manager.ts` - Add collection to schema
3. `frontend/src/App.tsx` - Register CollectionShapeUtil
4. `frontend/src/hooks/useBoardSync.ts` - Add CollectionShapeUtil
5. `frontend/src/components/BoardActionsMenu.tsx` - Add create collection action

## Considerations

- Collections should be selectable but may need special handling for nested selection
- When a collection is deleted, documents should be moved back to page parent
- Text label should be editable (tldraw text shapes are editable by default)
- Consider z-index/layering: background behind documents, label on top
- Collection bounds should update reactively when documents move