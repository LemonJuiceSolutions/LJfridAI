import { useState } from 'react';
import { Card, Stack } from 'react-bootstrap';
import {
  DndContext,
  DragOverlay,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { arrayMove, SortableContext, horizontalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface SortableItem {
  id: string;
  title: string;
}

const SortableItem = ({ item }: { item: SortableItem }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 1 : 0,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <Card ref={setNodeRef} style={style} {...attributes} {...listeners} className="border-secondary flex-shrink-0">
      <Card.Body className="py-5">
        <Card.Text>{item.title}</Card.Text>
      </Card.Body>
    </Card>
  );
};

const HorizontalExample = () => {
  const [items, setItems] = useState<SortableItem[]>([
    { id: '1', title: 'Item 1' },
    { id: '2', title: 'Item 2' },
    { id: '3', title: 'Item 3' },
    { id: '4', title: 'Item 4' },
    { id: '5', title: 'Item 5' },
    { id: '6', title: 'Item 6' },
    { id: '7', title: 'Item 7' },
    { id: '8', title: 'Item 8' },
    { id: '9', title: 'Item 9' },
    { id: '10', title: 'Item 10' },
    { id: '11', title: 'Item 11' },
    { id: '12', title: 'Item 12' },
    { id: '13', title: 'Item 13' },
    { id: '14', title: 'Item 14' },
    { id: '15', title: 'Item 15' },
    { id: '16', title: 'Item 16' },
    { id: '17', title: 'Item 17' },
    { id: '18', title: 'Item 18' },
    { id: '19', title: 'Item 19' },
    { id: '20', title: 'Item 20' },
  ]);

  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: (_, args) => {
        const index = items.findIndex((item) => item.id === args.active);
        return {
          x: index * 120, // Approximate width of each item
          y: 0,
        };
      },
    })
  );

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      setItems((items) => {
        const oldIndex = items.findIndex((item) => item.id === active.id);
        const newIndex = items.findIndex((item) => item.id === over.id);
        return arrayMove(items, oldIndex, newIndex);
      });
    }

    setActiveId(null);
  };

  const activeItem = activeId ? items.find((item) => item.id === activeId) : null;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveId(null)}
    >
      <SortableContext items={items} strategy={horizontalListSortingStrategy}>
        <Stack direction="horizontal" gap={2} className="overflow-auto pb-2">
          {items.map((item) => (
            <SortableItem key={item.id} item={item} />
          ))}
        </Stack>
      </SortableContext>

      <DragOverlay>
        {activeItem ? (
          <Card className="shadow-lg border-secondary">
            <Card.Body className="py-5">
              <Card.Text>{activeItem.title}</Card.Text>
            </Card.Body>
          </Card>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
};

export default HorizontalExample;
