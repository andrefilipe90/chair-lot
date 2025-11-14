import { GetServerSideProps } from "next";

const AppIndexRedirect = () => null;

export const getServerSideProps: GetServerSideProps = async () => {
  return {
    redirect: {
      destination: "/app/schedule",
      permanent: false,
    },
  };
};

export default AppIndexRedirect;
