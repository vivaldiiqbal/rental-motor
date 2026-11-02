import { Stepper } from '../ui/Stepper';
import { BOOKING_STEPS } from './draft';

export function BookingStepper({ current }: { current: number }) {
  return (
    <div className="card p-4 sm:p-5">
      <Stepper steps={BOOKING_STEPS} current={current} />
    </div>
  );
}
