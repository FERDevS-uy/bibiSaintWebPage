import React from "react";
import { config } from "src/config";

import prevArrow from "@assets/prev-arrow.svg?raw";
import nextArrow from "@assets/next-arrow.svg?raw";
import lastArrow from "@assets/last-arrow.svg?raw";
import firstArrow from "@assets/first-arrow.svg?raw";
import "../styles/navpag.css";
export default function NavPag({ totalPages, actualPage, baseURL = config.base }) {
  const nextUrl = baseURL.includes("page/")
    ? baseURL.replace(/page\/\d+/, `page/${+actualPage + 1}`)
    : `${baseURL}/page/${+actualPage + 1}`;

  const prevUrl = baseURL.includes("page/")
    ? baseURL.replace(/page\/\d+/, `page/${+actualPage - 1}`)
    : `${baseURL}/page/${+actualPage - 1}`;

  const lastUrl = baseURL.includes("page/")
    ? baseURL.replace(/page\/\d+/, `page/${totalPages}`)
    : `${baseURL}/page/${totalPages}`;

  const firstUrl = baseURL.includes("page/")
    ? baseURL.replace(/page\/\d+/, `page/1`)
    : `${baseURL}/page/1`;

  return (
    <nav className="pagination">
      {actualPage === 1 ? (
        <>
          <span className="button">
            <span dangerouslySetInnerHTML={{ __html: firstArrow }} />
          </span>
          <span className="button">
            <span dangerouslySetInnerHTML={{ __html: prevArrow }} />
          </span>
        </>
      ) : (
        <>
          <a href={firstUrl}>
            <span dangerouslySetInnerHTML={{ __html: firstArrow }} />
          </a>
          <a href={prevUrl}>
            <span dangerouslySetInnerHTML={{ __html: prevArrow }} />
          </a>
        </>
      )}

      <span>
        <span id="actualPage">{actualPage}</span> /{" "}
        <span id="totalPages">{totalPages}</span>
      </span>

      {actualPage === totalPages ? (
        <>
          <span className="button">
            <span dangerouslySetInnerHTML={{ __html: nextArrow }} />
          </span>
          <span className="button">
            <span dangerouslySetInnerHTML={{ __html: lastArrow }} />
          </span>
        </>
      ) : (
        <>
          <a href={nextUrl}>
            <span dangerouslySetInnerHTML={{ __html: nextArrow }} />
          </a>
          <a href={lastUrl}>
            <span dangerouslySetInnerHTML={{ __html: lastArrow }} />
          </a>
        </>
      )}
    </nav>
  );
}
