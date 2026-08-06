import { authenticate } from "../shopify.server";
import { useLoaderData } from "react-router";

export const loader = async ({ request }) => {
  const { admin } = await authenticate.admin(request);

  const orders = [];
  let cursor = null;
  let hasNextPage = true;
  let currencyCode = "";
  let countryCode = "";
  let timezoneOffsetMinutes = 0;

  while (hasNextPage) {
    const response = await admin.graphql(
      `#graphql
        query SeasonalMarketingOrders($cursor: String) {
          shop {
            currencyCode
            timezoneOffsetMinutes
            shopAddress {
              countryCodeV2
            }
          }
          orders(first: 50, after: $cursor, sortKey: CREATED_AT) {
            nodes {
              id
              createdAt
              cancelledAt
              test
              customerJourneySummary {
                ready
                firstVisit {
                  source
                  utmParameters {
                    campaign
                    source
                    medium
                  }
                }
                lastVisit {
                  source
                  utmParameters {
                    campaign
                    source
                    medium
                  }
                }
              }
              currentTotalPriceSet {
                shopMoney {
                  amount
                }
              }
              lineItems(first: 250) {
                nodes {
                  quantity
                  product {
                    id
                    title
                  }
                }
              }
            }
            pageInfo {
              hasNextPage
              endCursor
            }
          }
        }
      `,
      {
        variables: {
          cursor,
        },
      },
    );

    const responseJson = await response.json();
    const orderPage = responseJson.data.orders;

    orders.push(...orderPage.nodes);

    currencyCode = responseJson.data.shop.currencyCode;
    countryCode = responseJson.data.shop.shopAddress.countryCodeV2;
    timezoneOffsetMinutes = responseJson.data.shop.timezoneOffsetMinutes;

    hasNextPage = orderPage.pageInfo.hasNextPage;
    cursor = orderPage.pageInfo.endCursor;
  }

  return {
    orders,
    currencyCode,
    countryCode,
    timezoneOffsetMinutes,
  };
};

export default function SeasonalMarketingIntelligence() {
  const {
    orders,
    currencyCode,
    countryCode,
    timezoneOffsetMinutes,
  } = useLoaderData();

  const validOrders = orders.filter(
    (order) => !order.test && !order.cancelledAt,
  );

  const monthlyPerformance = Object.values(
    validOrders.reduce((months, order) => {
      const orderDate = new Date(order.createdAt);

      const monthKey = `${orderDate.getFullYear()}-${String(
        orderDate.getMonth() + 1,
      ).padStart(2, "0")}`;

      if (!months[monthKey]) {
        months[monthKey] = {
          month: monthKey,
          orders: 0,
          revenue: 0,
        };
      }

      months[monthKey].orders += 1;
      months[monthKey].revenue += Number(
        order.currentTotalPriceSet.shopMoney.amount,
      );

      return months;
    }, {}),
  ).sort((a, b) => a.month.localeCompare(b.month));

  const strongestMonth =
    monthlyPerformance.length > 0
      ? monthlyPerformance.reduce((strongest, month) =>
          month.revenue > strongest.revenue ? month : strongest,
        )
      : null;

  const hasSeasonalHistory = monthlyPerformance.length >= 12;

  const getNthWeekdayOfMonth = (
    year,
    month,
    weekday,
    occurrence,
  ) => {
    const firstDay = new Date(
      Date.UTC(year, month, 1),
    ).getUTCDay();

    const day =
      1 +
      ((weekday - firstDay + 7) % 7) +
      (occurrence - 1) * 7;

    return new Date(Date.UTC(year, month, day));
  };

  const buildRetailEvents = (year) => {
    const thanksgiving = getNthWeekdayOfMonth(
      year,
      10,
      4,
      4,
    );

    const blackFriday = new Date(thanksgiving);
    blackFriday.setUTCDate(
      blackFriday.getUTCDate() + 1,
    );

    const cyberMonday = new Date(blackFriday);
    cyberMonday.setUTCDate(
      cyberMonday.getUTCDate() + 3,
    );

    const events = [
      {
        name: "New Year's Day",
        date: new Date(Date.UTC(year, 0, 1)),
      },
      {
        name: "Valentine's Day",
        date: new Date(Date.UTC(year, 1, 14)),
      },
      {
        name: "Halloween",
        date: new Date(Date.UTC(year, 9, 31)),
      },
      {
        name: "Black Friday",
        date: blackFriday,
      },
      {
        name: "Cyber Monday",
        date: cyberMonday,
      },
      {
        name: "Christmas Day",
        date: new Date(Date.UTC(year, 11, 25)),
      },
    ];

    if (countryCode === "AU") {
      events.push(
        {
          name: "Australia Day",
          date: new Date(Date.UTC(year, 0, 26)),
        },
        {
          name: "Mother's Day",
          date: getNthWeekdayOfMonth(
            year,
            4,
            0,
            2,
          ),
        },
        {
          name: "Father's Day",
          date: getNthWeekdayOfMonth(
            year,
            8,
            0,
            1,
          ),
        },
      );
    }

    if (countryCode === "US") {
      events.push(
        {
          name: "Mother's Day",
          date: getNthWeekdayOfMonth(
            year,
            4,
            0,
            2,
          ),
        },
        {
          name: "Father's Day",
          date: getNthWeekdayOfMonth(
            year,
            5,
            0,
            3,
          ),
        },
        {
          name: "Independence Day",
          date: new Date(Date.UTC(year, 6, 4)),
        },
        {
          name: "Labor Day",
          date: getNthWeekdayOfMonth(
            year,
            8,
            1,
            1,
          ),
        },
      );
    }

    return events;
  };

  const merchantNow = new Date(
    Date.now() +
      timezoneOffsetMinutes * 60 * 1000,
  );

  const merchantToday = new Date(
    Date.UTC(
      merchantNow.getUTCFullYear(),
      merchantNow.getUTCMonth(),
      merchantNow.getUTCDate(),
    ),
  );

  const currentYear =
    merchantToday.getUTCFullYear();

  const upcomingRetailEvents = [
    ...buildRetailEvents(currentYear),
    ...buildRetailEvents(currentYear + 1),
  ]
    .filter((event) => event.date >= merchantToday)
    .sort((a, b) => a.date - b.date);

  const nextRetailEvent =
    upcomingRetailEvents[0] || null;

  const daysUntilNextRetailEvent = nextRetailEvent
    ? Math.ceil(
        (nextRetailEvent.date - merchantToday) /
          (24 * 60 * 60 * 1000),
      )
    : null;

  const marketingCalendar = upcomingRetailEvents
    .slice(0, 5)
    .map((event) => {
      const planningDate = new Date(event.date);
      planningDate.setUTCDate(
        planningDate.getUTCDate() - 42,
      );

      const launchDate = new Date(event.date);
      launchDate.setUTCDate(
        launchDate.getUTCDate() - 14,
      );

      let status = "Upcoming";

      if (
        merchantToday >= planningDate &&
        merchantToday < launchDate
      ) {
        status = "Planning now";
      }

      if (
        merchantToday >= launchDate &&
        merchantToday <= event.date
      ) {
        status = "Campaign window";
      }

      return {
        ...event,
        planningDate,
        launchDate,
        status,
      };
    });

  const campaignPerformance = Object.values(
    validOrders.reduce((campaigns, order) => {
      const journey =
        order.customerJourneySummary;

      if (!journey?.ready) {
        return campaigns;
      }

      const visit =
        journey.lastVisit || journey.firstVisit;

      const utm = visit?.utmParameters;

      if (!utm?.campaign) {
        return campaigns;
      }

      const source =
        utm.source || visit.source || "Unknown";

      const medium =
        utm.medium || "Unknown";

      const campaignKey =
        `${utm.campaign}-${source}-${medium}`;

      if (!campaigns[campaignKey]) {
        campaigns[campaignKey] = {
          campaign: utm.campaign,
          source,
          medium,
          orders: 0,
          revenue: 0,
        };
      }

      campaigns[campaignKey].orders += 1;
      campaigns[campaignKey].revenue += Number(
        order.currentTotalPriceSet.shopMoney.amount,
      );

      return campaigns;
    }, {}),
  ).sort((a, b) => b.revenue - a.revenue);

  const totalCampaignOrders =
    campaignPerformance.reduce(
      (total, campaign) =>
        total + campaign.orders,
      0,
    );

  const totalCampaignRevenue =
    campaignPerformance.reduce(
      (total, campaign) =>
        total + campaign.revenue,
      0,
    );

  const topCampaign =
    campaignPerformance[0] || null;

  return (
    <s-page heading="Seasonal & Marketing Intelligence">
      <s-section heading="Phase 5 Overview">
        <s-paragraph>
          Plan ahead by identifying seasonal
          opportunities, preparing for key shopping
          periods, organising marketing activity, and
          measuring campaign performance.
        </s-paragraph>
      </s-section>

      <s-section heading="Seasonal Trends">
        <s-paragraph>
          Orders analysed: {validOrders.length}
        </s-paragraph>

        <s-paragraph>
          Months containing sales data:{" "}
          {monthlyPerformance.length}
        </s-paragraph>

        <s-paragraph>
          Seasonal history:{" "}
          {hasSeasonalHistory
            ? "Enough historical data for seasonal comparison"
            : "Not enough historical data for reliable seasonal comparison"}
        </s-paragraph>

        <s-paragraph>
          Strongest sales month:{" "}
          {strongestMonth
            ? strongestMonth.month
            : "No sales data available"}
        </s-paragraph>

        <s-paragraph>
          Strongest month revenue:{" "}
          {strongestMonth
            ? `${currencyCode} ${strongestMonth.revenue.toFixed(2)}`
            : "No sales data available"}
        </s-paragraph>
      </s-section>

      <s-section heading="Holiday Planning">
        <s-paragraph>
          Store country:{" "}
          {countryCode || "Country not available"}
        </s-paragraph>

        <s-paragraph>
          Next retail event:{" "}
          {nextRetailEvent
            ? nextRetailEvent.name
            : "No upcoming event available"}
        </s-paragraph>

        <s-paragraph>
          Event date:{" "}
          {nextRetailEvent
            ? nextRetailEvent.date
                .toISOString()
                .slice(0, 10)
            : "No date available"}
        </s-paragraph>

        <s-paragraph>
          Days until event:{" "}
          {daysUntilNextRetailEvent !== null
            ? daysUntilNextRetailEvent
            : "Not available"}
        </s-paragraph>

        <s-paragraph>
          Upcoming retail planning calendar:
        </s-paragraph>

        {upcomingRetailEvents
          .slice(0, 5)
          .map((event) => (
            <s-paragraph
              key={`${event.name}-${event.date.toISOString()}`}
            >
              {event.name}:{" "}
              {event.date
                .toISOString()
                .slice(0, 10)}
            </s-paragraph>
          ))}
      </s-section>

      <s-section heading="Marketing Calendar">
        <s-paragraph>
          Recommended campaign schedule: begin planning
          6 weeks before each event and enter the
          campaign window 2 weeks before the event.
        </s-paragraph>

        {marketingCalendar.map((event) => (
          <s-paragraph
            key={`${event.name}-${event.date.toISOString()}`}
          >
            {event.name} — Plan:{" "}
            {event.planningDate
              .toISOString()
              .slice(0, 10)}{" "}
            | Launch:{" "}
            {event.launchDate
              .toISOString()
              .slice(0, 10)}{" "}
            | Event:{" "}
            {event.date
              .toISOString()
              .slice(0, 10)}{" "}
            | Status: {event.status}
          </s-paragraph>
        ))}
      </s-section>

      <s-section heading="Campaign Effectiveness">
        <s-paragraph>
          Campaigns detected:{" "}
          {campaignPerformance.length}
        </s-paragraph>

        <s-paragraph>
          UTM-attributed orders:{" "}
          {totalCampaignOrders}
        </s-paragraph>

        <s-paragraph>
          UTM-attributed revenue: {currencyCode}{" "}
          {totalCampaignRevenue.toFixed(2)}
        </s-paragraph>

        <s-paragraph>
          Top campaign:{" "}
          {topCampaign
            ? topCampaign.campaign
            : "No campaign data available"}
        </s-paragraph>

        <s-paragraph>
          Top campaign source:{" "}
          {topCampaign
            ? topCampaign.source
            : "No campaign data available"}
        </s-paragraph>

        {campaignPerformance.length === 0 ? (
          <s-paragraph>
            No UTM-attributed campaign sales data is
            currently available.
          </s-paragraph>
        ) : (
          campaignPerformance
            .slice(0, 5)
            .map((campaign) => (
              <s-paragraph
                key={`${campaign.campaign}-${campaign.source}-${campaign.medium}`}
              >
                {campaign.campaign} — Source:{" "}
                {campaign.source} | Medium:{" "}
                {campaign.medium} | Orders:{" "}
                {campaign.orders} | Revenue:{" "}
                {currencyCode}{" "}
                {campaign.revenue.toFixed(2)}
              </s-paragraph>
            ))
        )}
      </s-section>
    </s-page>
  );
}