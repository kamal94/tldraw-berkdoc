import { Editor, Tldraw } from "tldraw";
import "tldraw/tldraw.css";
import { DocumentShapeUtil } from "./shapes/DocumentShape";
import type { Contributor } from "./shapes/DocumentShape";
import sampleData from "./data/sample-documents.json";

// Custom shape utilities to register
const customShapeUtils = [DocumentShapeUtil];

// Helper to get contributors from user IDs
function getContributors(contributorIds: string[]): Contributor[] {
  return contributorIds
    .map((id) => {
      const user = sampleData.users.find((u) => u.id === id);
      if (!user) return null;
      return {
        name: user.name,
        avatarUrl: user.avatarUrl,
        color: user.color,
      } as Contributor;
    })
    .filter((c): c is Contributor => c !== null);
}

// Create sample document shapes when the editor mounts
function handleEditorMount(editor: Editor) {
  const CARD_WIDTH = 300;
  const CARD_HEIGHT = 140;
  const GAP = 40;
  const CARDS_PER_ROW = 3;

  // Calculate starting position to center the grid
  const totalWidth = CARDS_PER_ROW * CARD_WIDTH + (CARDS_PER_ROW - 1) * GAP;
  const startX = -totalWidth / 2;
  const startY = -200;

  // Create document shapes from sample data
  sampleData.documents.forEach((doc, index) => {
    const row = Math.floor(index / CARDS_PER_ROW);
    const col = index % CARDS_PER_ROW;

    editor.createShape({
      type: "document",
      x: startX + col * (CARD_WIDTH + GAP),
      y: startY + row * (CARD_HEIGHT + GAP),
      props: {
        w: CARD_WIDTH,
        h: CARD_HEIGHT,
        title: doc.title,
        url: doc.url,
        contributors: getContributors(doc.contributorIds),
        dimensions: doc.dimensions,
      },
    });
  });

  // Center the camera on the shapes
  editor.zoomToFit({ animation: { duration: 0 } });
}

function App() {
  return (
    <div style={{ position: "fixed", inset: 0 }}>
      <Tldraw
        shapeUtils={customShapeUtils}
        onMount={handleEditorMount}
        options={{
          maxShapesPerPage: 100 * 1000,
        }}
      />
    </div>
  );
}

export default App;
