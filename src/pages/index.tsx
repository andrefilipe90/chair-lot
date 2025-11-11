import { GetServerSideProps } from "next";

const IndexPage = () => null;

export const getServerSideProps: GetServerSideProps = async () => {
  return {
    redirect: {
      destination: "/api/auth/signin",
      permanent: false,
    },
  };
};

export default IndexPage;
