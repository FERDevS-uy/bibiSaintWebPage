import React from "react";

import prevArrow from "@assets/prev-arrow.svg?raw";
import nextArrow from "@assets/next-arrow.svg?raw";
import lastArrow from "@assets/last-arrow.svg?raw";
import firstArrow from "@assets/first-arrow.svg?raw";

import "../styles/navpag.css";

export default function NavPag({ actualPage, totalPages, onChangePage }) {
  return (
    <nav className="pagination">
      {/* Primera + Anterior */}
      {actualPage === 1 ? (
        <>
          <span
            className="button disabled"
            dangerouslySetInnerHTML={{ __html: firstArrow }}
          />
          <span
            className="button disabled"
            dangerouslySetInnerHTML={{ __html: prevArrow }}
          />
        </>
      ) : (
        <>
          <button
            className="button clickable"
            onClick={() => onChangePage(1)}
            dangerouslySetInnerHTML={{ __html: firstArrow }}
          />
          <button
            className="button clickable"
            onClick={() => onChangePage(actualPage - 1)}
            dangerouslySetInnerHTML={{ __html: prevArrow }}
          />
        </>
      )}

      {/* indicador */}
      <span className="pages">
        <span>{actualPage}</span> / <span>{totalPages}</span>
      </span>

      {/* Siguiente + Última */}
      {actualPage === totalPages ? (
        <>
          <span
            className="button disabled"
            dangerouslySetInnerHTML={{ __html: nextArrow }}
          />
          <span
            className="button disabled"
            dangerouslySetInnerHTML={{ __html: lastArrow }}
          />
        </>
      ) : (
        <>
          <button
            className="button clickable"
            onClick={() => onChangePage(actualPage + 1)}
            dangerouslySetInnerHTML={{ __html: nextArrow }}
          />
          <button
            className="button clickable"
            onClick={() => onChangePage(totalPages)}
            dangerouslySetInnerHTML={{ __html: lastArrow }}
          />
        </>
      )}
    </nav>
  );
}
