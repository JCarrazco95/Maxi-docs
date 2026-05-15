# dnd-kit — Editor Drag & Drop de Campos de Firma

## Instalación
```bash
npm install @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities @dnd-kit/modifiers
```

---

## Conceptos clave

| Concepto | Qué hace |
|----------|----------|
| `DndContext` | Envuelve toda la zona drag & drop |
| `useDraggable` | Hook para hacer un elemento arrastrable |
| `useDroppable` | Hook para hacer una zona donde se puede soltar |
| `useSortable` | Combina draggable + droppable para listas reordenables |
| `DragOverlay` | El elemento que se ve mientras arrastras |
| `modifiers` | Restricciones: solo mover en X, solo en Y, dentro de un área, etc. |

---

## Patrón 1 — Campo arrastrable sobre un canvas (caso PDF)

Este es el patrón para colocar campos de firma encima de un PDF renderizado.

```tsx
import {
  DndContext,
  useDraggable,
  DragEndEvent,
  DragOverlay,
} from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { useState } from 'react';

// Tipo de campo de firma
interface SignatureField {
  id: string;
  type: 'signature' | 'text' | 'date' | 'checkbox';
  x: number;
  y: number;
  width: number;
  height: number;
  page: number;
  label: string;
}

// Componente de campo arrastrable
function DraggableField({ field }: { field: SignatureField }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: field.id,
    data: { field }, // pasar datos extra
  });

  const style = {
    position: 'absolute' as const,
    left: field.x,
    top: field.y,
    width: field.width,
    height: field.height,
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.5 : 1,
    cursor: 'grab',
    zIndex: isDragging ? 999 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} {...listeners} {...attributes}>
      <div className="field-inner">
        {field.label}
      </div>
    </div>
  );
}

// Canvas principal con el PDF
function PDFCanvas({ fields, onFieldMove }: {
  fields: SignatureField[];
  onFieldMove: (id: string, x: number, y: number) => void;
}) {
  const { setNodeRef } = useDroppable({ id: 'pdf-canvas' });

  return (
    <div
      ref={setNodeRef}
      style={{ position: 'relative', width: 794, height: 1123 }} // A4 en px a 96dpi
    >
      {/* Aquí va el canvas de PDF.js */}
      <canvas id="pdf-render" style={{ position: 'absolute', top: 0, left: 0 }} />

      {/* Campos de firma encima */}
      {fields.map(field => (
        <DraggableField key={field.id} field={field} />
      ))}
    </div>
  );
}

// App principal
export default function SignatureEditor() {
  const [fields, setFields] = useState<SignatureField[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);

  function handleDragEnd(event: DragEndEvent) {
    const { active, delta } = event;

    setFields(prev => prev.map(field => {
      if (field.id === active.id) {
        return {
          ...field,
          x: field.x + delta.x,
          y: field.y + delta.y,
        };
      }
      return field;
    }));

    setActiveId(null);
  }

  function addField(type: SignatureField['type']) {
    const newField: SignatureField = {
      id: crypto.randomUUID(),
      type,
      x: 100,
      y: 100,
      width: 200,
      height: 50,
      page: 1,
      label: type === 'signature' ? 'Firma aquí' : type,
    };
    setFields(prev => [...prev, newField]);
  }

  const activeField = fields.find(f => f.id === activeId);

  return (
    <DndContext
      onDragStart={({ active }) => setActiveId(active.id as string)}
      onDragEnd={handleDragEnd}
    >
      {/* Toolbar de tipos de campos */}
      <div className="toolbar">
        <button onClick={() => addField('signature')}>+ Firma</button>
        <button onClick={() => addField('text')}>+ Texto</button>
        <button onClick={() => addField('date')}>+ Fecha</button>
        <button onClick={() => addField('checkbox')}>+ Checkbox</button>
      </div>

      {/* Canvas del PDF */}
      <PDFCanvas fields={fields} onFieldMove={() => {}} />

      {/* Overlay visual mientras arrastras */}
      <DragOverlay>
        {activeField && (
          <div style={{ width: activeField.width, height: activeField.height, background: 'rgba(59,130,246,0.3)', border: '2px dashed #3b82f6', borderRadius: 4 }}>
            {activeField.label}
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}
```

---

## Patrón 2 — Lista sortable (reordenar páginas o firmantes)

```tsx
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface Signer {
  id: string;
  name: string;
  email: string;
  order: number;
}

function SortableSigner({ signer }: { signer: Signer }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: signer.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="signer-row">
      {/* Handle de arrastre */}
      <button {...attributes} {...listeners} className="drag-handle">
        ⠿
      </button>
      <span>{signer.name}</span>
      <span>{signer.email}</span>
    </div>
  );
}

export function SignersList() {
  const [signers, setSigners] = useState<Signer[]>([
    { id: '1', name: 'Juan García', email: 'juan@ejemplo.com', order: 1 },
    { id: '2', name: 'María López', email: 'maria@ejemplo.com', order: 2 },
  ]);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setSigners(prev => {
        const oldIndex = prev.findIndex(s => s.id === active.id);
        const newIndex = prev.findIndex(s => s.id === over.id);
        return arrayMove(prev, oldIndex, newIndex);
      });
    }
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={signers.map(s => s.id)} strategy={verticalListSortingStrategy}>
        {signers.map(signer => (
          <SortableSigner key={signer.id} signer={signer} />
        ))}
      </SortableContext>
    </DndContext>
  );
}
```

---

## Patrón 3 — Toolbar con drag para soltar en el canvas (como PandaDoc)

```tsx
// El usuario arrastra desde la toolbar y suelta en el PDF

function ToolbarFieldType({ type, label }: { type: string; label: string }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `toolbar-${type}`,
    data: { fromToolbar: true, fieldType: type },
  });

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      style={{ opacity: isDragging ? 0.4 : 1, cursor: 'grab' }}
      className="toolbar-item"
    >
      {label}
    </div>
  );
}

// En el DndContext principal, detectar si viene de toolbar:
function handleDragEnd(event: DragEndEvent) {
  const { active, over, delta } = event;

  if (active.data.current?.fromToolbar && over?.id === 'pdf-canvas') {
    // Calcular posición relativa al canvas
    const canvasRect = document.getElementById('pdf-canvas')!.getBoundingClientRect();
    // Agregar nuevo campo en esa posición
    addField(active.data.current.fieldType, dropX, dropY);
  }
}
```

---

## Modifiers útiles

```tsx
import {
  restrictToWindowEdges,        // No salir de la ventana
  restrictToParentElement,      // No salir del contenedor padre
  restrictToHorizontalAxis,     // Solo mover horizontalmente
  restrictToVerticalAxis,       // Solo mover verticalmente
  snapCenterToCursor,           // El centro del elemento sigue al cursor
} from '@dnd-kit/modifiers';

// Usar en DndContext:
<DndContext modifiers={[restrictToParentElement]}>
```

---

## Guardar posiciones en DB

```tsx
// Cuando el usuario termina de editar, serializar todos los campos:
function saveFields() {
  const payload = fields.map(field => ({
    id: field.id,
    type: field.type,
    x: Math.round(field.x),
    y: Math.round(field.y),
    width: field.width,
    height: field.height,
    page: field.page,
  }));

  // Guardar en backend
  await fetch('/api/documents/:id/fields', {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

// Cargar desde DB:
function loadFields(savedFields: SignatureField[]) {
  setFields(savedFields);
}
```

---

## Detección de colisiones

```tsx
import {
  closestCenter,     // Para listas sortables
  closestCorners,    // Para kanban / grid
  pointerWithin,     // Más preciso para canvas libre
  rectIntersection,  // Por área de intersección
} from '@dnd-kit/core';

// Para editor de PDF usa pointerWithin:
<DndContext collisionDetection={pointerWithin}>
```

---

## Errores comunes

| Error | Solución |
|-------|----------|
| El elemento salta al soltar | Usar `delta` en `onDragEnd` para mover relativamente, no posición absoluta del cursor |
| No detecta el drop zone | Verificar que `useDroppable` tenga un `id` único y que el ref esté aplicado al DOM |
| Lag en elementos con `position:absolute` | Usar `CSS.Translate` en lugar de `CSS.Transform` |
| Conflicto con scroll | Agregar `activationConstraint: { distance: 8 }` al `PointerSensor` |

```tsx
// Solución para conflicto con scroll:
const sensors = useSensors(
  useSensor(PointerSensor, {
    activationConstraint: { distance: 8 }, // requiere mover 8px antes de activar drag
  })
);
```
