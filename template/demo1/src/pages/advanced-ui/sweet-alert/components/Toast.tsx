import { Button } from 'react-bootstrap';
import Swal from 'sweetalert2';
import withReactContent from 'sweetalert2-react-content';

const MySwal = withReactContent(Swal);

const ToastExample = () => {
  const showToast = () => {
    MySwal.fire({
      title: 'Signed in successfully',
      customClass: {
        title: 'fs-5 m-0',
        popup: 'd-flex align-items-center',
      },
      icon: 'success',
      toast: true,
      position: 'top-end',
      showConfirmButton: false,
      timer: 3000,
      timerProgressBar: true,
      didOpen: (toast) => {
        toast.onmouseenter = Swal.stopTimer;
        toast.onmouseleave = Swal.resumeTimer;
      },
    });
  };

  return (
    <Button variant="primary" onClick={showToast}>
      Show SweetAlert
    </Button>
  );
};

export default ToastExample;
