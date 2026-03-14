import { useState } from 'react';
import { ListGroup } from 'react-bootstrap';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragOverlay,
} from '@dnd-kit/core';
import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface Item {
  id: string;
  title: string;
}

// Sortable Item Component
const SortableItem = ({ id, title }: Item) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    cursor: 'grab',
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <ListGroup.Item className="my-1" variant="primary">
        {title}
      </ListGroup.Item>
    </div>
  );
};

const VerticalExample = () => {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [items, setItems] = useState([
    { id: '1', title: 'Item 1' },
    { id: '2', title: 'Item 2' },
    { id: '3', title: 'Item 3' },
    { id: '4', title: 'Item 4' },
    { id: '5', title: 'Item 5' },
  ]);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event;
    setActiveId(active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      setItems((items: Item[]) => {
        const oldIndex = items.findIndex((item: Item) => item.id === String(active.id));
        const newIndex = items.findIndex((item: Item) => item.id === String(over.id));

        return arrayMove(items, oldIndex, newIndex);
      });
    }
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={items} strategy={verticalListSortingStrategy}>
        <ListGroup>
          {items.map((item) => (
            <SortableItem key={item.id} id={item.id} title={item.title} />
          ))}
        </ListGroup>
      </SortableContext>
      <DragOverlay>
        <ListGroup>
          {activeId ? (
            <ListGroup.Item id={activeId} variant="primary" className="shadow-lg my-1">
              {items.find((item) => item.id === activeId)?.title}
            </ListGroup.Item>
          ) : null}
        </ListGroup>
      </DragOverlay>
    </DndContext>
  );
};

export default VerticalExample;
