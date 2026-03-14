import { useEffect, useRef } from 'react';
import { Card, Col, Row } from 'react-bootstrap';
import { DateSelectArg, EventClickArg } from '@fullcalendar/core';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin, { Draggable } from '@fullcalendar/interaction';
import listPlugin from '@fullcalendar/list';
import { INITIAL_EVENTS, createEventId } from './event-utils';

const CalendarPage = () => {
  const externalEventsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let draggableInstance: Draggable | null = null;
    if (externalEventsRef.current) {
      draggableInstance = new Draggable(externalEventsRef.current, {
        itemSelector: '.fc-event',
        eventData: (eventEl) => ({
          title: eventEl.innerText,
          backgroundColor: eventEl.getAttribute('data-bgcolor'),
          borderColor: eventEl.getAttribute('data-bdcolor'),
        }),
      });
    }

    return () => {
      if (draggableInstance) {
        draggableInstance.destroy(); // Clean up instance on unmount
      }
    };
  }, []);

  const handleDateSelect = (selectInfo: DateSelectArg) => {
    const title = prompt('Please enter a new title for your event');
    const calendarApi = selectInfo.view.calendar;

    calendarApi.unselect(); // clear date selection

    if (title) {
      calendarApi.addEvent({
        id: createEventId(),
        title,
        start: selectInfo.startStr,
        end: selectInfo.endStr,
        allDay: selectInfo.allDay,
      });
    }
  };

  const handleEventClick = (clickInfo: EventClickArg) => {
    if (confirm(`Are you sure you want to delete the event '${clickInfo.event.title}'`)) {
      clickInfo.event.remove();
    }
  };

  // const handleEvents = (events: EventApi[]) => {
  //   console.log(events);
  // };

  return (
    <Row>
      <Col md={12} className="mb-0 mb-md-4">
        <Card>
          <Card.Body>
            <FullCalendar
              plugins={[dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin]}
              headerToolbar={{
                left: 'prev,next today',
                center: 'title',
                right: 'dayGridMonth,timeGridWeek,timeGridDay,list',
              }}
              initialView="dayGridMonth"
              editable={true}
              selectable={true}
              selectMirror={false}
              dayMaxEvents={true}
              weekends={true}
              initialEvents={INITIAL_EVENTS} // alternatively, use the `events` setting to fetch from a feed
              select={handleDateSelect}
              eventClick={handleEventClick}
              // eventsSet={handleEvents} // called after events are initialized/added/changed/removed
              /* you can update a remote database when these fire:
              eventAdd={function(){}}
              eventChange={function(){}}
              eventRemove={function(){}}
              */
            />
          </Card.Body>
        </Card>
      </Col>
      <Col md={12} className="d-none d-md-block">
        <Card>
          <Card.Body>
            <Card.Title>Draggable Events</Card.Title>
            <div className="d-flex" ref={externalEventsRef}>
              <div
                className="fc-event"
                style={{ backgroundColor: 'rgba(253,126,20,.25)', borderColor: '#fd7e14' }}
                data-bgcolor="rgba(253,126,20,.25)"
                data-bdcolor="#fd7e14"
              >
                Birth Day
              </div>
              <div
                className="fc-event"
                style={{ backgroundColor: 'rgba(241,0,117,.25)', borderColor: '#f10075' }}
                data-bgcolor="rgba(241,0,117,.25)"
                data-bdcolor="#f10075"
              >
                New Project
              </div>
              <div
                className="fc-event"
                style={{ backgroundColor: 'rgba(0,204,204,.25)', borderColor: '#00cccc' }}
                data-bgcolor="rgba(0,204,204,.25)"
                data-bdcolor="#00cccc"
              >
                Anniversary
              </div>
              <div
                className="fc-event"
                style={{ backgroundColor: 'rgba(18,182,89,.25)', borderColor: '#10b759' }}
                data-bgcolor="rgba(18,182,89,.25)"
                data-bdcolor="#10b759"
              >
                Client Meeting
              </div>
              <div
                className="fc-event"
                style={{ backgroundColor: 'rgba(91,71,251,.2)', borderColor: '#5b47fb' }}
                data-bgcolor="rgba(91,71,251,.2)"
                data-bdcolor="#5b47fb"
              >
                Office Trip
              </div>
            </div>
          </Card.Body>
        </Card>
      </Col>
    </Row>
  );
};

export default CalendarPage;
