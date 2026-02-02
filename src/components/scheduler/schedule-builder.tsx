/**
 * Schedule Builder Component
 * 
 * Component for building specific schedules (days of week and hours)
 */

'use client';

import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

interface ScheduleBuilderProps {
  daysOfWeek?: string;
  hours?: string;
  onDaysOfWeekChange: (value: string) => void;
  onHoursChange: (value: string) => void;
}

const DAYS_OF_WEEK = [
  { value: '0', label: 'Dom' },
  { value: '1', label: 'Lun' },
  { value: '2', label: 'Mar' },
  { value: '3', label: 'Mer' },
  { value: '4', label: 'Gio' },
  { value: '5', label: 'Ven' },
  { value: '6', label: 'Sab' },
];

const HOURS = Array.from({ length: 24 }, (_, i) => ({
  value: i.toString(),
  label: `${i.toString().padStart(2, '0')}:00`
}));

export function ScheduleBuilder({
  daysOfWeek,
  hours,
  onDaysOfWeekChange,
  onHoursChange,
}: ScheduleBuilderProps) {
  const selectedDays = daysOfWeek ? daysOfWeek.split(',').map(Number) : [];
  const selectedHours = hours ? hours.split(',').map(Number) : [];

  const toggleDay = (day: number) => {
    const newDays = selectedDays.includes(day)
      ? selectedDays.filter(d => d !== day)
      : [...selectedDays, day].sort((a, b) => a - b);
    onDaysOfWeekChange(newDays.join(','));
  };

  const toggleHour = (hour: number) => {
    const newHours = selectedHours.includes(hour)
      ? selectedHours.filter(h => h !== hour)
      : [...selectedHours, hour].sort((a, b) => a - b);
    onHoursChange(newHours.join(','));
  };

  const selectAllDays = () => {
    onDaysOfWeekChange('0,1,2,3,4,5,6');
  };

  const clearAllDays = () => {
    onDaysOfWeekChange('');
  };

  const selectAllHours = () => {
    onHoursChange(HOURS.map(h => h.value).join(','));
  };

  const clearAllHours = () => {
    onHoursChange('');
  };

  const selectWorkingHours = () => {
    onHoursChange('9,10,11,12,13,14,15,16,17');
  };

  return (
    <div className="space-y-6">
      {/* Days of Week */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Giorni della Settimana</CardTitle>
          <CardDescription>Seleziona i giorni in cui eseguire il task</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={selectAllDays}
            >
              Tutti
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={clearAllDays}
            >
              Nessuno
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onDaysOfWeekChange('1,2,3,4,5')}
            >
              Giorni lavorativi
            </Button>
          </div>

          <div className="flex flex-wrap gap-2">
            {DAYS_OF_WEEK.map((day) => (
              <Button
                key={day.value}
                type="button"
                variant={selectedDays.includes(parseInt(day.value)) ? 'default' : 'outline'}
                size="sm"
                onClick={() => toggleDay(parseInt(day.value))}
              >
                {day.label}
              </Button>
            ))}
          </div>

          {selectedDays.length > 0 && (
            <p className="text-sm text-muted-foreground">
              Selezionati: {DAYS_OF_WEEK
                .filter(d => selectedDays.includes(parseInt(d.value)))
                .map(d => d.label)
                .join(', ')}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Hours */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Ore</CardTitle>
          <CardDescription>Seleziona le ore in cui eseguire il task</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2 flex-wrap">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={selectAllHours}
            >
              Tutte (24h)
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={clearAllHours}
            >
              Nessuna
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={selectWorkingHours}
            >
              Orario lavorativo (9-17)
            </Button>
          </div>

          <div className="grid grid-cols-6 sm:grid-cols-8 gap-2">
            {HOURS.map((hour) => (
              <Button
                key={hour.value}
                type="button"
                variant={selectedHours.includes(parseInt(hour.value)) ? 'default' : 'outline'}
                size="sm"
                onClick={() => toggleHour(parseInt(hour.value))}
                className="text-xs"
              >
                {hour.label}
              </Button>
            ))}
          </div>

          {selectedHours.length > 0 && (
            <p className="text-sm text-muted-foreground">
              Selezionate: {selectedHours.length} ore
            </p>
          )}
        </CardContent>
      </Card>

      {/* Summary */}
      {(selectedDays.length > 0 || selectedHours.length > 0) && (
        <Card className="bg-muted/50">
          <CardContent className="pt-6">
            <p className="text-sm font-medium">Riepilogo Scheduling:</p>
            <p className="text-sm text-muted-foreground mt-1">
              {selectedDays.length > 0 && (
                <span>Giorni: {DAYS_OF_WEEK
                  .filter(d => selectedDays.includes(parseInt(d.value)))
                  .map(d => d.label)
                  .join(', ')}{' '}
                </span>
              )}
              {selectedHours.length > 0 && (
                <span>
                  Ore: {selectedHours.length === 24
                    ? 'tutte le ore'
                    : selectedHours.map(h => `${h}:00`).join(', ')}
                </span>
              )}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
