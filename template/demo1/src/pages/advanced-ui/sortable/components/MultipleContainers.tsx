import { useState, useMemo } from 'react';
import { Row, Col, Card, Badge } from 'react-bootstrap';
import {
  DndContext,
  DragOverlay,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
  useDroppable,
  DragOverEvent,
} from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, arrayMove, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface Item {
  id: string;
  title: string;
  containerId: string;
}

interface ContainerProps {
  id: string;
  title: string;
  items: Item[];
}

const SortableItem = ({ item }: { item: Item }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 100 : 'auto',
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      role="button"
      tabIndex={0}
      aria-label={`Drag ${item.title} to reorder`}
    >
      <Card className="mb-2" style={{ cursor: isDragging ? 'grabbing' : 'grab' }}>
        <Card.Body>
          <div className="d-flex">
            <p className="me-2">{item.title}</p>
            <Badge bg="primary">{item.containerId}</Badge>
          </div>
        </Card.Body>
      </Card>
    </div>
  );
};

const SortableContainer = ({
  container,
  isOver,
  isDragging,
}: {
  container: ContainerProps;
  isOver: boolean;
  isDragging: boolean;
}) => {
  const { setNodeRef } = useDroppable({
    id: container.id,
  });

  return (
    <Card className="h-100">
      <Card.Header>
        <h6>{container.title}</h6>
      </Card.Header>
      <Card.Body
        ref={setNodeRef}
        style={{ minHeight: '300px' }}
        className={isDragging && isOver ? ' bg-secondary bg-opacity-10' : ''}
        role="region"
        aria-label={`${container.title} container`}
      >
        <SortableContext items={container.items} strategy={verticalListSortingStrategy}>
          {container.items.map((item) => (
            <SortableItem key={item.id} item={item} />
          ))}
          {container.items.length === 0 && <div className="text-secondary text-center py-4">Drop items here</div>}
        </SortableContext>
      </Card.Body>
    </Card>
  );
};

const MultipleContainersExample = () => {
  const [containers, setContainers] = useState<ContainerProps[]>([
    {
      id: 'container-1',
      title: 'Backlog',
      items: [
        { id: 'item-1', title: 'Task 1', containerId: 'container-1' },
        { id: 'item-2', title: 'Task 2', containerId: 'container-1' },
        { id: 'item-3', title: 'Task 3', containerId: 'container-1' },
      ],
    },
    {
      id: 'container-2',
      title: 'In Progress',
      items: [{ id: 'item-4', title: 'Task 4', containerId: 'container-2' }],
    },
    {
      id: 'container-3',
      title: 'Done',
      items: [
        { id: 'item-5', title: 'Task 5', containerId: 'container-3' },
        { id: 'item-6', title: 'Task 6', containerId: 'container-3' },
      ],
    },
  ]);

  const [activeId, setActiveId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    }),
    useSensor(KeyboardSensor)
  );

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragOver = (event: DragOverEvent) => {
    const { over } = event;
    setOverId(over ? (over.id as string) : null);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (!over) {
      setActiveId(null);
      setOverId(null);
      return;
    }

    // Find the active container and item
    const activeContainer = containers.find((cont) => cont.items.some((item) => item.id === active.id));

    if (!activeContainer) return;

    const activeItem = activeContainer.items.find((item) => item.id === active.id);
    if (!activeItem) return;

    // Determine the target container
    let overContainer = containers.find((cont) => cont.id === over.id);
    if (!overContainer) {
      // over.id might be an item ID, find its container
      overContainer = containers.find((cont) => cont.items.some((item) => item.id === over.id));
    }

    if (!overContainer) return;

    const activeIndex = activeContainer.items.findIndex((item) => item.id === active.id);

    // Same container - reorder
    if (activeContainer.id === overContainer.id) {
      const overIndex = overContainer.items.findIndex((item) => item.id === over.id);
      if (overIndex === -1) return; // Shouldn't happen in same container

      const newItems = arrayMove(activeContainer.items, activeIndex, overIndex);
      setContainers(
        containers.map((container) =>
          container.id === activeContainer.id ? { ...container, items: newItems } : container
        )
      );
    }
    // Different containers - move item
    else {
      // Remove from active container
      const newActiveItems = activeContainer.items.filter((item) => item.id !== active.id);

      // Add to target container
      let insertIndex = overContainer.items.length; // Default to end

      // If dropped on an item, insert before it
      if (over.id !== overContainer.id) {
        const overIndex = overContainer.items.findIndex((item) => item.id === over.id);
        if (overIndex !== -1) {
          insertIndex = overIndex;
        }
      }

      const newOverItems = [...overContainer.items];
      newOverItems.splice(insertIndex, 0, { ...activeItem, containerId: overContainer.id });

      setContainers(
        containers.map((container) => {
          if (container.id === activeContainer.id) {
            return { ...container, items: newActiveItems };
          }
          if (container.id === overContainer.id) {
            return { ...container, items: newOverItems };
          }
          return container;
        })
      );
    }

    setActiveId(null);
    setOverId(null);
  };

  const handleDragCancel = () => {
    setActiveId(null);
    setOverId(null);
  };

  const activeItem = activeId
    ? containers.flatMap((container) => container.items).find((item) => item.id === activeId)
    : null;

  // Helper function to determine if a container is being hovered over
  const getContainerOverState = useMemo(() => {
    return (containerId: string) => {
      if (!overId) return false;

      // Check if overId is the container itself
      if (overId === containerId) return true;

      // Check if overId is an item in this container
      const container = containers.find((c) => c.id === containerId);
      return container ? container.items.some((item) => item.id === overId) : false;
    };
  }, [overId, containers]);

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <Row>
        {containers.map((container) => (
          <Col key={container.id} md={4} className="mb-3 mb-md-0">
            <SortableContainer
              container={container}
              isOver={getContainerOverState(container.id)}
              isDragging={!!activeId}
            />
          </Col>
        ))}
      </Row>

      <DragOverlay>
        {activeItem ? (
          <Card style={{ width: '100%', transform: 'rotate(2deg)' }}>
            <Card.Body>
              <div className="d-flex">
                <p className="me-2">{activeItem.title}</p>
                <Badge bg="primary">{activeItem.containerId}</Badge>
              </div>
            </Card.Body>
          </Card>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
};

export default MultipleContainersExample;
